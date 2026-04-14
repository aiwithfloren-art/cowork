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

You have access to the user's Google Calendar, Google Tasks, and selected Google Drive files. You MUST call tools to get real data — never make up events, tasks, files, or content.

## When to call which tool

- Schedule / meetings today → call get_today_schedule
- Schedule / meetings this week → call get_week_schedule
- Tasks, todo list, overdue → call list_tasks
- Add a task → call add_task
- Mark task done → call complete_task
- Create / schedule / book an event → call add_calendar_event
- Find time / free slot / when am I available → call find_meeting_slots
- **ANY question about files, documents, docs, drive, sheets, spreadsheets, PDFs** — whether user asks "what files do I have", "list my files", "cek file", "file apa saja", "show my documents", "dokumen apa", "summarize X doc", "read X file" — you MUST call list_connected_files FIRST. Do not assume the list is empty. Do not respond without calling the tool.
- To read contents of a specific file → call list_connected_files, find the matching file_id, then call read_connected_file
- Save a personal note → call save_note
- Recall personal notes → call get_notes

## Rules

1. NEVER describe what a tool would return without calling it. ALWAYS call the tool first.
2. NEVER say "no files connected" or "list is empty" unless list_connected_files actually returned count: 0.
3. After calling tools, ALWAYS write a natural-language response to the user based on the real data. Never end your turn with only tool calls.
4. Keep responses concise, warm, and actionable. Use bullet points when listing things.
5. When the user asks "what should I focus on?", call get_today_schedule AND list_tasks first, then prioritize based on real data.
6. Default timezone for creating events: Asia/Jakarta (+07:00).
7. Reply in the same language the user wrote in (Indonesian → Indonesian, English → English).`;

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
