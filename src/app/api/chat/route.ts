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

## CRITICAL RULES — READ FIRST

1. NEVER fabricate a success message. If you say "task assigned" or "email sent" or "note saved", you MUST have ACTUALLY called the corresponding tool in this turn. If you did not call it, DO NOT claim it happened.

2. When the user says "kasih task ke [someone]", "assign X ke Budi", "delegasi ke Sarah", "tolong minta [name] untuk Y" — you MUST call the tool **assign_task_to_member**. Do NOT use add_task (that only works for yourself). If the teammate's email is not in the prompt, call list_team_members first to find it, then call assign_task_to_member with their email. If either tool returns an error, include the exact error text in your reply instead of pretending it worked.

### Example of the REQUIRED pattern for delegation

User: "kasih task ke budi@acme.com: review proposal deadline Jumat"
Correct behavior:
  → call assign_task_to_member({ member_email: "budi@acme.com", title: "review proposal", due: "2026-04-17" })
  → tool returns { ok: true, assigned_to: "budi@acme.com", task_created: true, notification_created: true, email_sent: true }
  → reply: "Task sudah ter-assign ke budi@acme.com. Dia bakal dapet notif di Sigap + email."

WRONG behavior (never do this):
  → call add_task({ title: "review proposal" }) ← this creates in YOUR list, not Budi's
  → reply: "Task sudah dibuat untuk Budi" ← LIE, it's in your list

User: "kasih task ke Sarah: follow up client"
Correct behavior:
  → call list_team_members({}) to find Sarah's email
  → tool returns members list with Sarah's email
  → call assign_task_to_member({ member_email: "sarah@...", title: "follow up client" })
  → reply with real result

3. You have access to the user's Google Calendar, Google Tasks, Gmail, Drive files, notes, and team data — you MUST call tools to get real data or cause real side effects. Never make up results.

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
- User says **"kasih task ke X", "assign Y ke Budi", "tolong minta Sarah review Z", "delegasi ke Andi"** → you MUST call assign_task_to_member. DO NOT use add_task for teammates — add_task only creates in your own list. If you don't know the teammate's email, call list_team_members first. assign_task_to_member creates the task in THEIR Google Tasks, inserts a notification row, and emails them — all three together. Never fabricate a success message without actually calling the tool. If the tool returns an error, tell the user the exact error.
- User asks **"ada notif baru", "siapa yang assign gue apa", "check notifications"** → call list_notifications
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

Whenever the user reveals a durable, factual piece of information, SILENTLY call save_note in the background BEFORE writing your reply. Do not announce it, do not ask permission, do not mention it in your reply.

You MUST categorize each memory into one of 4 types. Pick the most specific type that fits:

**type: "user"** — who the user is
- Role, job, industry, seniority ("gue founder startup SaaS")
- Skills, expertise, experience level ("10 tahun ngoding Go, baru belajar React")
- Personal goals, motivations, what they're optimizing for
- Languages spoken, location, timezone
- Examples:
  - "User is the founder of a Jakarta-based startup called Cowork"
  - "User is a data scientist focused on observability/logging"

**type: "feedback"** — how to work with the user
- Communication style preferences ("jangan panjang-panjang", "pake bahasa casual")
- Corrections ("bukan itu maksud gue, yang benar X")
- Workflow preferences ("gue benci meeting pagi", "jangan kasih opsi, langsung aja")
- Explicit approvals of an approach ("perfect, keep doing that")
- Examples:
  - "User prefers terse responses with no trailing summaries"
  - "User wants meetings only after 14:00 — mornings are deep work"

**type: "project"** — current work state
- Deadlines, launch dates, milestones ("launch 15 Mei")
- Metrics, KPIs, numbers ("MRR $1.2k, retention 40% W4")
- Client/deal info ("Acme mau annual deal $2k/bulan, pushback diskon 20%")
- People they work with ("Budi itu engineering lead")
- Decisions with rationale ("kita pake Groq bukan OpenAI karena latency")
- Examples:
  - "Cowork beta launch target is 2026-05-15"
  - "Current MRR is $1.2k with 40% W4 retention (as of 2026-04-15)"

**type: "reference"** — pointers to external systems
- Where information lives ("bugs di Linear project INGEST")
- Dashboard URLs, Slack channels, repo locations
- Tools and where to find things
- Examples:
  - "Pipeline bugs tracked in Linear project INGEST"
  - "Oncall dashboard: grafana.internal/d/api-latency"

**type: "general"** — fallback when none of the above fit. Use sparingly.

Do NOT save:
- Ephemeral small talk, greetings, thanks
- Questions the user is asking
- Data already in source systems (calendar events, emails — those are fetchable)
- Speculation or "maybe" statements

Format: one short declarative sentence that still makes sense in a month. Include dates when relevant ("as of 2026-04-15").

When the user asks "apa yang lo tau tentang gue", "siapa gue", "ingetan lo apa" → call get_notes with the matching type (usually type="user"). When they ask "gimana cara kerja lo sama gue" → type="feedback". When they ask "update proyek gue apa" → type="project".`;

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

  // Deterministic routing: some models (Kimi K2) are unreliable at picking
  // the right tool for delegation even with few-shot examples. When the
  // user's message clearly matches "delegate this to teammate X", force
  // the assign_task_to_member tool via toolChoice so the model must call
  // it instead of fabricating a response.
  const msgText = lastUser.content.toLowerCase();
  const looksLikeDelegation =
    /\b(kasih|assign|delegasi|tolong\s+minta|suruh)\b.*\b(task|tugas|review|follow\s*up|prep|siapin|buat|bikin)/i.test(
      lastUser.content,
    ) ||
    (/\b(kasih|assign|delegasi|tolong)\b/i.test(msgText) &&
      /@[a-z0-9._-]+\.[a-z]{2,}/i.test(msgText));

  try {
    const result = await generateText({
      model: groq(model),
      system: systemWithTime,
      messages: body.messages,
      tools,
      stopWhen: stepCountIs(12),
      ...(looksLikeDelegation && {
        toolChoice: { type: "tool" as const, toolName: "assign_task_to_member" },
      }),
    });

    const toolsCalled = (result.steps ?? [])
      .flatMap((s: { toolCalls?: Array<{ toolName?: string }> }) => s.toolCalls ?? [])
      .map((tc) => tc.toolName);
    console.log("[chat] tools called:", toolsCalled, "user msg:", lastUser.content.slice(0, 100));

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
