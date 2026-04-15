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
- User asks "what files do I have", "list files", "cek file", "file apa aja" → call **list_connected_files** then respond with the list. Stop there.
- User asks to **summarize / read / explain / show contents of / ringkas / baca / isi** a specific file → SKIP list_connected_files. Call **read_connected_file** DIRECTLY with the file name as the query (the tool does fuzzy matching). Then write a real summary based on the actual content returned. NEVER respond with just metadata (id, type) — you MUST include the actual content summary.
- Save a personal note → call save_note
- Recall personal notes → call get_notes
- User asks about **current events, news, recent info, public facts, research, anything you might not know** → call web_search
- User asks to **check email, read email, summarize inbox, emails from someone** → call list_recent_emails first, then read_email for specific messages
- User asks to **send email, kirim email, reply to X** → draft the content first, confirm with user, then call send_email when they approve ("kirim", "send it", "ya")
- User says **"email tim", "kirim ke semua member", "bcc tim engineering"** without specifying emails → call list_team_members FIRST to get addresses, then draft and confirm before send_email
- User asks to **update/edit/reschedule** existing event → call update_calendar_event
- User asks to **cancel/delete** event → call delete_calendar_event
- User asks to **edit/update** task → call update_task
- User asks to **delete/remove** task → call delete_task

## Multi-step / chained workflows

You CAN and SHOULD call multiple tools in one response when the request requires it. Examples:

- "Cariin info terbaru tentang X dan bikin event meeting buat diskusiinnya" →
  1. web_search({ query: "X latest 2026" })
  2. add_calendar_event({ title, start, end, description: <summary from search> })
  3. Reply confirming both actions

- "Baca file Y dan summarize jadi task baru" →
  1. read_connected_file({ query: "Y" })
  2. add_task({ title: "Follow up on Y: <key takeaway>" })
  3. Reply confirming

- "Cek berita tentang Llama 4, baca AI Roadmap doc aku, terus bikin event deep dive" →
  1. web_search({ query: "Llama 4 release news" })
  2. read_connected_file({ query: "AI Roadmap" })
  3. add_calendar_event({ ... description combining both ... })
  4. Reply with summary of all three steps

When chaining tools, do all the calls THEN write a single coherent response that summarizes results and confirms actions.

## Rules

1. NEVER describe what a tool would return without calling it. ALWAYS call the tool first.
2. NEVER say "no files connected" or "list is empty" unless list_connected_files actually returned count: 0.
3. After calling tools, ALWAYS write a natural-language response to the user based on the real data. Never end your turn with only tool calls.
4. Keep responses concise, warm, and actionable. Use bullet points when listing things.
5. When the user asks "what should I focus on?", call get_today_schedule AND list_tasks first, then prioritize based on real data.
6. Default timezone for creating events: Asia/Jakarta (+07:00).
7. Reply in the same language the user wrote in (Indonesian → Indonesian, English → English).

## Silent memory capture (IMPORTANT)

Whenever the user reveals a durable, factual piece of information about their work, projects, people, decisions, preferences, or context — SILENTLY call save_note in the background BEFORE writing your reply. Do not announce it, do not ask permission, do not mention it in your reply.

Save when the user shares things like:
- Names, roles, or contact info of people they work with ("Budi itu engineering lead")
- Project status, metrics, deadlines ("MRR kita sekarang $1.2k", "launch target 15 Mei")
- Pricing, deals, client info ("Acme mau annual deal diskon 20%")
- Decisions and rationale ("kita pake Groq bukan OpenAI karena latency")
- Preferences and working style ("gue benci meeting pagi", "fokus terbaik gue jam 2-5 sore")
- Recurring pain points or goals
- Explicit corrections to earlier info ("bukan Jumat, Kamis")

Do NOT save:
- Ephemeral small talk, greetings, thanks
- Questions the user is asking (that's a question, not a fact)
- Data already fetched from tools (calendar events, emails — those live in source systems)
- Speculation or "maybe" statements

Format the note as a short declarative sentence with enough context to make sense months later. Example: user says "MRR $1.2k" → save: "Current MRR is $1.2k (as of 2026-04-15)".

After saving, write your normal reply without mentioning the save. The note becomes searchable via get_notes in future sessions.`;

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
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: rl.message,
        reason: rl.reason,
        resetsAt: rl.resetsAt ?? null,
        settingsLink: "/settings",
      },
      { status: 429 },
    );
  }

  const body = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const lastUser = body.messages[body.messages.length - 1];
  const groq = getGroq(settings?.groq_key ?? undefined);
  // Always use the current DEFAULT_MODEL; the per-user `model` column
  // is reserved for a future model-picker UI but should not silently
  // pin users to an outdated default value.
  const model = DEFAULT_MODEL;
  const tools = buildTools(userId);

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
  const systemWithTime = `${SYSTEM_PROMPT}

## Current date & time
Right now it is ${nowJakarta} Asia/Jakarta (WIB, UTC+07:00).

When the user says a time without a date (e.g. "jam 22:00", "besok pagi", "tomorrow 3pm"), resolve it relative to THIS moment. If no date is mentioned, assume today in Asia/Jakarta. Always pass ISO datetimes with the +07:00 offset to calendar tools. Never guess a year — use the current year shown above.`;

  try {
    const result = await generateText({
      model: groq(model),
      system: systemWithTime,
      messages: body.messages,
      tools,
      stopWhen: stepCountIs(12),
    });

    let text = result.text || extractTextFromSteps(result);

    // Fallback: if no text but tools were called, synthesize a response
    // from the last tool result so the user at least sees something useful.
    if (!text) {
      const lastToolResult = findLastToolResult(result);
      if (lastToolResult) {
        text = summarizeToolResult(lastToolResult);
      }
    }

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

type StepLike = {
  text?: string;
  content?: Array<{
    type?: string;
    text?: string;
    toolName?: string;
    output?: unknown;
    result?: unknown;
  }>;
  toolResults?: Array<{ toolName?: string; output?: unknown; result?: unknown }>;
};

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

type LastTool = { toolName: string; output: unknown };

function findLastToolResult(result: { steps?: StepLike[] }): LastTool | null {
  const steps = result.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (Array.isArray(s.toolResults)) {
      for (let j = s.toolResults.length - 1; j >= 0; j--) {
        const tr = s.toolResults[j];
        if (tr?.toolName && (tr.output || tr.result)) {
          return { toolName: tr.toolName, output: tr.output ?? tr.result };
        }
      }
    }
    if (Array.isArray(s.content)) {
      for (let j = s.content.length - 1; j >= 0; j--) {
        const c = s.content[j];
        if (
          (c?.type === "tool-result" || c?.type === "tool-output") &&
          c.toolName &&
          (c.output || c.result)
        ) {
          return { toolName: c.toolName, output: c.output ?? c.result };
        }
      }
    }
  }
  return null;
}

function summarizeToolResult(t: LastTool): string {
  const o = t.output as Record<string, unknown> | null;
  if (!o) return "";

  if (t.toolName === "list_connected_files") {
    const files = (o.files ?? []) as Array<{
      id: string;
      name: string;
      type: string;
    }>;
    const total = typeof o.total === "number" ? o.total : files.length;
    if (files.length === 0) {
      return "You don't have any connected files yet. Go to Settings → Connected Files → Add file from Drive to pick documents.";
    }
    const lines = files.map((f, i) => `${i + 1}. ${f.name} (${f.type})`);
    const header =
      total > files.length
        ? `Here are your ${files.length} most recent connected files (of ${total} total):`
        : `You have ${files.length} connected file${files.length === 1 ? "" : "s"}:`;
    return header + "\n\n" + lines.join("\n");
  }

  if (t.toolName === "list_tasks") {
    const tasks = o as unknown as Array<{ title: string; due?: string }>;
    if (!Array.isArray(tasks) || tasks.length === 0) return "No open tasks — you're clear.";
    return (
      "Open tasks:\n" +
      tasks.map((x) => `• ${x.title}${x.due ? ` (due ${x.due})` : ""}`).join("\n")
    );
  }

  if (t.toolName === "get_today_schedule" || t.toolName === "get_week_schedule") {
    const events = o as unknown as Array<{ title: string; start: string; end: string }>;
    if (!Array.isArray(events) || events.length === 0) return "No events scheduled.";
    return (
      "Events:\n" +
      events.map((e) => `• ${e.title} (${e.start} – ${e.end})`).join("\n")
    );
  }

  // Generic fallback: stringify compactly
  try {
    return "Result:\n```\n" + JSON.stringify(o, null, 2).slice(0, 2000) + "\n```";
  } catch {
    return "";
  }
}
