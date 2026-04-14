import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { buildTools } from "@/lib/llm/tools";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Cowork, a personal AI Chief of Staff.

You help the user stay on top of their day by reading their Google Calendar, Google Tasks, and Google Docs.
When the user asks about their schedule, tasks, or documents, call the appropriate tool to get real data.
Never make up events, tasks, or deadlines — always fetch them via tools first.

Keep responses concise, warm, and actionable. Default to bullet points when listing things.
When the user asks "what should I focus on?", read today's schedule AND open tasks, then prioritize.
If the user asks you to summarize a document, search for it by name first, then read it.`;

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: settings } = await sb
    .from("user_settings")
    .select("groq_key, model")
    .eq("user_id", userId)
    .maybeSingle();

  const userHasOwnKey = Boolean(settings?.groq_key);
  const rl = await checkRateLimit(userId, userHasOwnKey);
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[] };
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const groq = getGroq(settings?.groq_key ?? undefined);
  const model = settings?.model ?? DEFAULT_MODEL;
  const tools = buildTools(userId);

  try {
    const result = await generateText({
      model: groq(model),
      system: SYSTEM_PROMPT,
      messages: body.messages,
      tools,
      stopWhen: stepCountIs(6),
    });

    const usage = result.usage;
    const tokensIn = usage?.inputTokens ?? 0;
    const tokensOut = usage?.outputTokens ?? 0;
    const cost = estimateCost(tokensIn, tokensOut);

    if (!userHasOwnKey) {
      await logUsage(userId, tokensIn, tokensOut, cost, model);
    }

    // Persist conversation
    await sb.from("chat_messages").insert([
      { user_id: userId, role: "user", content: body.messages[body.messages.length - 1].content },
      { user_id: userId, role: "assistant", content: result.text },
    ]);

    return NextResponse.json({ text: result.text });
  } catch (e) {
    console.error("chat error:", e);
    const message = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
