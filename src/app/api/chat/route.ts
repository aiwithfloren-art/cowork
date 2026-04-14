import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { buildTools } from "@/lib/llm/tools";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Sigap, a personal AI Chief of Staff.

You help the user stay on top of their day by reading their Google Calendar and Google Tasks.
When the user asks about their schedule or tasks, call the appropriate tool to get real data.
Never make up events, tasks, or deadlines — always fetch them via tools first.

Keep responses concise, warm, and actionable. Default to bullet points when listing things.
When the user asks "what should I focus on?", read today's schedule AND open tasks, then prioritize.

If the user asks you to read a Google Doc, Sheet, or Drive file, first call list_connected_files to see what they've connected. If empty, explain they need to add files in Settings → Connected Files first (Sigap only reads files they explicitly connect, for privacy). If a matching file exists, call read_connected_file with its ID.

IMPORTANT: After calling tools, you MUST write a natural-language response to the user summarizing what you found. Never end a turn with only tool calls — always provide a text answer.

When creating calendar events, default timezone is Asia/Jakarta (+07:00) unless the user says otherwise.`;

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

  const body = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const lastUser = body.messages[body.messages.length - 1];
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

    const text = result.text || extractTextFromSteps(result);

    if (!text) {
      console.error("chat: empty text", {
        steps: result.steps?.length,
        finishReason: result.finishReason,
      });
      return NextResponse.json(
        {
          error:
            "The AI didn't return a text response. Try rephrasing, or ask a simpler question.",
        },
        { status: 500 },
      );
    }

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    const cost = estimateCost(tokensIn, tokensOut);

    if (!userHasOwnKey) {
      await logUsage(userId, tokensIn, tokensOut, cost, model);
    }

    await sb.from("chat_messages").insert([
      { user_id: userId, role: "user", content: lastUser.content },
      { user_id: userId, role: "assistant", content: text },
    ]);

    // Stream the buffered text back so the Chat component still animates it.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunks = text.split(/(\s+)/);
        let i = 0;
        const push = () => {
          if (i >= chunks.length) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(chunks[i]));
          i++;
          setTimeout(push, 20);
        };
        push();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    console.error("chat error:", e);
    const message = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type StepLike = { text?: string; content?: Array<{ type?: string; text?: string }> };

function extractTextFromSteps(result: { steps?: StepLike[] }): string {
  const steps = result.steps ?? [];
  const parts: string[] = [];
  for (const s of steps) {
    if (s.text) parts.push(s.text);
    const content = s.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "text" && c.text) parts.push(c.text);
      }
    }
  }
  return parts.join("").trim();
}
