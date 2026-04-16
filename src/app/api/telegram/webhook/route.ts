import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { buildTools } from "@/lib/llm/tools";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { tryInterceptDelegation } from "@/lib/llm/delegate-intercept";

export const runtime = "nodejs";
export const maxDuration = 60;

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from: { id: number; first_name?: string; username?: string };
    text?: string;
  };
};

export async function POST(req: Request) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const msg = update.message;
  if (!msg || !msg.text) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const tgUserId = msg.from.id;
  const text = msg.text.trim();

  const sb = supabaseAdmin();

  // Is this user already linked?
  const { data: link } = await sb
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_user_id", tgUserId)
    .maybeSingle();

  // /start with a code parameter
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const code = parts[1];
    if (code) {
      return await handleLinkCode(chatId, tgUserId, msg.from.username, code);
    }
    if (link) {
      await sendTelegramMessage(
        chatId,
        "You're already linked to Sigap ✅\nAsk me anything about your schedule, tasks, or docs.",
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "👋 Welcome to Sigap Bot!\n\nTo link your account, open https://cowork-gilt.vercel.app/settings and copy the 6-digit linking code, then reply here with `/start CODE`.",
      );
    }
    return NextResponse.json({ ok: true });
  }

  // 6-digit code without /start
  if (/^\d{6}$/.test(text)) {
    return await handleLinkCode(chatId, tgUserId, msg.from.username, text);
  }

  // Must be linked to chat with the AI
  if (!link) {
    await sendTelegramMessage(
      chatId,
      "You're not linked yet. Open https://cowork-gilt.vercel.app/settings and get a 6-digit code, then send it to me.",
    );
    return NextResponse.json({ ok: true });
  }

  // Route to AI
  return await handleAIChat(link.user_id, chatId, text);
}

async function handleLinkCode(
  chatId: number,
  tgUserId: number,
  tgUsername: string | undefined,
  code: string,
) {
  const sb = supabaseAdmin();
  const { data: linkCode } = await sb
    .from("telegram_link_codes")
    .select("user_id, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (!linkCode || new Date(linkCode.expires_at) < new Date()) {
    await sendTelegramMessage(
      chatId,
      "❌ Invalid or expired code. Get a fresh one at https://cowork-gilt.vercel.app/settings",
    );
    return NextResponse.json({ ok: true });
  }

  await sb.from("telegram_links").upsert({
    user_id: linkCode.user_id,
    telegram_user_id: tgUserId,
    telegram_username: tgUsername ?? null,
    linked_at: new Date().toISOString(),
  });
  await sb.from("telegram_link_codes").delete().eq("code", code);

  await sendTelegramMessage(
    chatId,
    "✅ *Linked!* You can now chat with your Sigap AI right here.\n\nTry asking:\n• What's my schedule today?\n• Add a task: ...\n• What should I focus on?",
  );
  return NextResponse.json({ ok: true });
}

async function handleAIChat(userId: string, chatId: number, text: string) {
  const sb = supabaseAdmin();
  const { data: settings } = await sb
    .from("user_settings")
    .select("groq_key, model")
    .eq("user_id", userId)
    .maybeSingle();

  const userHasOwnKey = Boolean(settings?.groq_key);
  const rl = await checkRateLimit(userId, userHasOwnKey);
  if (!rl.ok) {
    await sendTelegramMessage(chatId, `⚠️ ${rl.message}`);
    return NextResponse.json({ ok: true });
  }

  // Bypass LLM for delegation prompts (same as web chat)
  const delegationReply = await tryInterceptDelegation(userId, text);
  if (delegationReply) {
    await sb.from("chat_messages").insert([
      { user_id: userId, role: "user", content: text },
      { user_id: userId, role: "assistant", content: delegationReply },
    ]);
    await sendTelegramMessage(chatId, delegationReply);
    return NextResponse.json({ ok: true });
  }

  try {
    const groq = getGroq(settings?.groq_key ?? undefined);
    const model = DEFAULT_MODEL;
    const tools = buildTools(userId);

    // Indicate typing
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }).catch(() => {});

    // Load last 10 messages for context continuity
    const { data: priorMessages } = await sb
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(10);
    const history = (priorMessages ?? []).reverse() as {
      role: "user" | "assistant";
      content: string;
    }[];

    const nowJakarta = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    const systemPrompt = `You are Sigap, a personal AI Chief of Staff replying via Telegram.

Current date/time: ${nowJakarta} Asia/Jakarta (WIB, UTC+07:00).

## Rules
1. Keep replies concise — Telegram messages should be 1-3 short paragraphs, not long essays.
2. ALWAYS call tools to get real Google Calendar/Tasks/Gmail/Drive/notes data. Never invent.
3. When user says "kasih task ke [email]" — delegation is handled before you see the message; if you're seeing it, the pattern didn't match.
4. Silently save durable facts (names, deadlines, metrics, preferences) via save_note with the right type. Don't mention saving.
5. Reply in the same language the user wrote in (Indonesian → Indonesian, English → English).
6. If no date is mentioned but time is (e.g. "jam 22:00"), assume today in Asia/Jakarta.
7. Use plain text formatting — Telegram supports limited markdown. Bullet with •, not *.`;

    const result = await generateText({
      model: groq(model),
      system: systemPrompt,
      messages: [...history, { role: "user", content: text }],
      tools,
      stopWhen: stepCountIs(8),
    });

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    if (!userHasOwnKey) {
      await logUsage(userId, tokensIn, tokensOut, estimateCost(tokensIn, tokensOut), model);
    }

    await sb.from("chat_messages").insert([
      { user_id: userId, role: "user", content: text },
      { user_id: userId, role: "assistant", content: result.text },
    ]);

    await sendTelegramMessage(chatId, result.text || "(no response)");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("telegram ai error:", e);
    await sendTelegramMessage(
      chatId,
      "⚠️ Something went wrong. Try again in a moment.",
    );
    return NextResponse.json({ ok: true });
  }
}
