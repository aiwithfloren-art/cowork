import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText, stepCountIs } from "ai";
import { getLLMForAgent, estimateCost } from "@/lib/llm/providers";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";

export const runtime = "nodejs";
export const maxDuration = 60;

import { tryInterceptDelegation } from "@/lib/llm/delegate-intercept";
import { tryInterceptMeetingRecord, tryInterceptMeetingSummary } from "@/lib/llm/meeting-intercept";
import { tryInterceptCompanyContext } from "@/lib/llm/company-context-intercept";
import { loadPrimaryOrgContext, renderOrgContextBlock } from "@/lib/org-context";

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

4. **If you're missing context to do a task WELL, ASK before generating.** Examples: user asks for a PPT / proposal / pitch deck / landing page / marketing copy / caption / email to a client, and you don't know who the company is, their brand tone, or their target customer. Don't invent a generic brand voice. Ask 1-3 short clarifying questions, then do the task. The same rule applies to any other task where a missing piece of user-specific context would make the output generic — ask for the missing piece, THEN do the task. (Note: a separate system handles saving company-level context to the user's org profile when it's genuinely shared across sessions — see the "About the user's company" block if present. Don't re-ask for anything already there.)

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
- User says **"kabarin tim", "umumin ke semua", "broadcast X", "invite semua ke meeting Y"** → call broadcast_to_team. Bundle whatever side effects make sense: set create_event=true + event_start/end when there's a time, create_task=true + task_title when prep work is implied, send_email=true for formal announcements.
- User asks to **update/edit/reschedule** existing event → call update_calendar_event
- User asks to **cancel/delete** event → call delete_calendar_event
- User asks to **edit/update** task → call update_task
- User asks to **delete/remove** task → call delete_task
- User asks to **bikin gambar / buatin ilustrasi / generate image / create image** → call generate_image. After it returns a url, embed it in your reply as a markdown image: ![caption](that_url) — the chat UI will render it with a Download button. Keep your surrounding text short (one line before the image is enough).
- User asks to **bikin / buatkan / create / make / need / mau / butuh AI employee / agent / agen / asisten / assistant** (ANY phrasing, ANY typo, Indonesian suffixes like "buatkan"/"bikinin"/"bantuin", English plurals like "agents"/"employees", mixed language like "bikin 1 ai employees") → call **create_ai_employee**. NEVER refuse with "saya tidak punya kemampuan" — this tool IS the capability. If the user packed role + tasks + tone + name into one message, call it immediately with all args. If anything is unclear, ask ONE short clarifying question first, then call. Pick enabled_tools based on the agent's role (e.g. Content Drafter gets generate_carousel_html + web_search; Sales gets send_email + list_team_members).
- User asks to **edit / ubah / update / ganti / rename / tambahin tool ke** existing agent → call **edit_ai_employee** with target (name/slug) + only the fields being changed.
- User asks to **hapus / buang / delete / remove / fire** an agent → call **delete_agent** with target (name/slug, fuzzy match).
- User asks to **bikin carousel / PPT post / slide IG / slide LinkedIn / thread visual / carousel Instagram** → call **generate_carousel_html**. NEVER refuse with "I can't render images" — this tool produces real PNG images server-side. Generate 3-7 slides with hook → body → CTA structure, pick a palette (indigo / emerald / amber / rose / slate) and aspect_ratio (1:1 / 4:5 / 9:16). Tool returns \`png_urls\` array. Reply format: 1 short intro line + each slide as a markdown image \`![Slide 1](png_url_1)\`, one per line. Chat UI auto-renders with a Download button beside each PNG. No "open in new tab" needed — PNGs are ready-to-post.
- User asks to **bikin Google Doc / save as Google Doc / masukkan ke Google Docs / create a Google Doc** → call **create_google_doc** with title + full content_markdown. Tool returns url. In your reply, link to it with \`[📄 title](url)\`. If user also asked to email the link, call send_email AFTER with the URL embedded. NEVER claim "Doc created" without actually calling this tool — if the tool errors, include the exact error in your reply and suggest re-authorizing Google.
- User says **"install <agent>"**, **"aktifin <name>"**, **"tambahin agent <name>"**, **"setup <role>"** → call **install_skill({name})**. Fuzzy-matches the template name from the org's Skill Hub. After install, tell user the slug to @mention. If user asks **"apa aja agent yg bisa di-install"**, **"list skill"**, **"daftar template"** → call **list_installable_skills()** first and present the list (mark which ones are already installed).
- User **pastes an API token in chat** for a service that needs auth (Vercel, Linear, Notion, Stripe, etc) — typical pattern: user says something like "ini vercel token gw: XXXXX" or just pastes the token after you asked for it → call **save_credential({service, token})** with the service slug and the pasted value. After saving, WARN the user: "Token udah aman tersimpan. Lo bisa delete message di atas kalo mau hilang dari chat history juga." NEVER echo the token back in your reply.
- User asks to do something with a **third-party service that has no dedicated tool** (Vercel deploy, Linear issue, Notion page, Stripe customer, any REST API) → use the composition pattern:
  1. **list_credentials** — see what services the user has saved tokens for.
  2. **get_credential(service)** — fetch the token. If missing, tell the user "save token di /settings/connectors dulu (service: <slug>)" — do NOT try to proceed.
  3. **http_request({ method, url, headers, body })** — call the service's REST API. Build the right URL + headers from the service's docs (use your training knowledge; if unsure call web_search first to confirm the endpoint).
  4. NEVER echo the token back in your reply — just confirm the action with the result (deployment URL, issue ID, page URL, etc).
  Example — deploy to Vercel:
    - get_credential({service:"vercel"}) → token
    - http_request({method:"POST", url:"https://api.vercel.com/v13/deployments", headers:{"Authorization":"Bearer <token>","Content-Type":"application/json"}, body:JSON.stringify({name:"my-app",gitSource:{type:"github",repo:"user/repo",ref:"main"}})})
    - Reply: "✅ Deployed: https://<url>.vercel.app"
- User asks to **draft a post / caption / email / proposal / content piece** (any language: "buatin post IG", "draftin email ke klien", "bikin caption", "tulisin proposal untuk X", "bikin copy buat landing page") → call **create_artifact** with the full drafted body. The artifact lives at its own URL with Copy/Edit/Delete buttons — MUCH better UX than dumping long text in chat. In your chat reply, keep it SHORT (1-2 sentences) and link to the artifact: \`[📄 title](/artifacts/id)\`. Never paste the body_markdown in chat if you've already saved it as an artifact — that's duplication.

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
8. **NO HEDGING after you did the work.** If you called web_search and got a concrete answer (email, URL, phone, address), state it as fact. Do NOT add "please verify via official website", "pastikan double-check", "disarankan konfirmasi ulang", or similar disclaimers. You are a Chief of Staff, not a legal review — if you already fetched the data, trust it. Only add a verification note when search results are genuinely conflicting across sources, AND in that case cite the conflict specifically (e.g. "source A said X, source B said Y — worth confirming which is current"). If you feel uncertain, call web_search AGAIN with a different query; don't push the verification work back to the user. Same rule for read_connected_file, read_email, list_team_members — trust tool output, don't tell the user to "cek ulang" what you just fetched.

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
    agent_slug?: string;
  };
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const lastUser = body.messages[body.messages.length - 1];
  const allTools = await buildToolsForUser(userId);

  // If caller is chatting with a specific custom agent, narrow the tool
  // set + swap in the agent's system prompt.
  type AgentRecord = {
    id: string;
    name: string;
    system_prompt: string;
    enabled_tools: string[];
    llm_override_provider: string | null;
    llm_override_model: string | null;
  };
  let agentRecord: AgentRecord | null = null;
  if (body.agent_slug) {
    const { data } = await sb
      .from("custom_agents")
      .select(
        "id, name, system_prompt, enabled_tools, llm_override_provider, llm_override_model",
      )
      .eq("user_id", userId)
      .eq("slug", body.agent_slug)
      .maybeSingle();
    if (!data) {
      return NextResponse.json(
        { error: `Agent '${body.agent_slug}' not found` },
        { status: 404 },
      );
    }
    agentRecord = data as unknown as AgentRecord;
  }

  // Resolve LLM AFTER agent lookup so per-agent override takes effect.
  const llm = await getLLMForAgent(userId, agentRecord);

  // Per-employee tool restriction — if there's an org template matching this
  // agent's name with allowed_tools set, those override agent.enabled_tools
  // as an admin-policy-level cap. Empty allowed_tools = no restriction from
  // the template layer (fall through to agent's own enabled_tools).
  let templateAllowedTools: string[] = [];
  if (agentRecord) {
    const { data: member } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (member?.org_id) {
      const { data: tmpl } = await sb
        .from("org_agent_templates")
        .select("allowed_tools")
        .eq("org_id", member.org_id)
        .eq("name", agentRecord.name)
        .maybeSingle();
      templateAllowedTools =
        ((tmpl?.allowed_tools as string[] | null) ?? []).slice();
    }
  }

  const tools = agentRecord
    ? Object.fromEntries(
        Object.entries(allTools).filter(([k]) => {
          if (!agentRecord!.enabled_tools.includes(k)) return false;
          // If template has a whitelist, intersect with it.
          if (templateAllowedTools.length > 0) {
            return templateAllowedTools.includes(k);
          }
          return true;
        }),
      )
    : allTools;

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
  const baseSystem = agentRecord ? agentRecord.system_prompt : SYSTEM_PROMPT;

  // For main Sigap, show the list of sub-agents the user has built so the
  // model can accurately answer "what agents do I have?" and refer users
  // to /agents/<slug> without hallucinating.
  let agentsContext = "";
  if (!agentRecord) {
    const { data: userAgents } = await sb
      .from("custom_agents")
      .select("slug, name, emoji, description")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (userAgents && userAgents.length > 0) {
      const list = userAgents
        .map(
          (a) =>
            `- ${a.emoji ?? "🤖"} **${a.name}** — ${a.description ?? "(no description)"} — link: /agents/${a.slug}`,
        )
        .join("\n");
      agentsContext = `\n\n## User's sub-agents\n\nThe user has built the following sub-agents (AI employees). When the user asks about one by name, refer to it and share the link. For focused work on that role, suggest the user open its dedicated page.\n\n${list}`;
    }
  }

  const orgContextBlock = renderOrgContextBlock(
    await loadPrimaryOrgContext(userId),
  );

  const systemWithTime = `${baseSystem}${agentsContext}${orgContextBlock}

## Current date & time
Right now it is ${nowJakarta} Asia/Jakarta (WIB, UTC+07:00).

When the user says a time without a date (e.g. "jam 22:00", "besok pagi", "tomorrow 3pm"), resolve it relative to THIS moment. If no date is mentioned, assume today in Asia/Jakarta. Always pass ISO datetimes with the +07:00 offset to calendar tools. Never guess a year — use the current year shown above.`;

  // Intercepts only run for main Sigap chat — inside a sub-agent thread we
  // stay focused on that agent's job and never spawn new agents or meeting
  // bots mid-conversation. Each intercept is wrapped so a throw inside one
  // pattern (bad regex, LLM error, DB hiccup) falls through to the main LLM
  // instead of 500-ing the whole request.
  const history = body.messages.slice(0, -1) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  async function runIntercept(
    name: string,
    fn: () => Promise<string | null>,
  ): Promise<string | null> {
    if (agentRecord) return null;
    const t0 = Date.now();
    try {
      const reply = await fn();
      const ms = Date.now() - t0;
      if (ms > 5000) {
        console.warn(`[chat] intercept '${name}' took ${ms}ms`);
      }
      return reply;
    } catch (e) {
      console.error(
        `[chat] intercept '${name}' threw (falling through to main LLM):`,
        e instanceof Error ? `${e.message}\n${e.stack}` : e,
      );
      return null;
    }
  }

  async function respondIntercepted(reply: string) {
    const sb2 = supabaseAdmin();
    await sb2.from("chat_messages").insert([
      { user_id: userId, role: "user", content: lastUser.content, agent_id: null },
      { user_id: userId, role: "assistant", content: reply, agent_id: null },
    ]);
    return new Response(reply, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Agent create/edit/delete used to be regex intercepts that bypassed the
  // LLM entirely. Problem: regex couldn't parse Indonesian suffixes
  // ("buatkan"), English plurals ("employees"), typos, or any phrasing the
  // author didn't list in the pattern. We now expose them as real LLM tools
  // (create_ai_employee / edit_ai_employee / delete_agent) so the main
  // model handles the natural-language understanding — any phrasing works.
  // See commit history for the old implementations.

  const summaryReply = await runIntercept("meeting-summary", () =>
    tryInterceptMeetingSummary(userId, lastUser.content),
  );
  if (summaryReply) return respondIntercepted(summaryReply);

  const meetingReply = await runIntercept("meeting-record", () =>
    tryInterceptMeetingRecord(userId, lastUser.content),
  );
  if (meetingReply) return respondIntercepted(meetingReply);

  const delegationReply = await runIntercept("delegation", () =>
    tryInterceptDelegation(userId, lastUser.content),
  );
  if (delegationReply) return respondIntercepted(delegationReply);

  // Just-in-time Company Context setup. Fires when the user asks for a
  // brand-sensitive deliverable (PPT, proposal, pitch, client email, etc.)
  // and the org profile is thin — or mid-flow while we're still Q&A-ing.
  const contextReply = await runIntercept("company-context", () =>
    tryInterceptCompanyContext(userId, lastUser.content, history),
  );
  if (contextReply) return respondIntercepted(contextReply);

  try {
    const result = await generateText({
      model: llm.model,
      system: systemWithTime,
      messages: body.messages,
      tools,
      stopWhen: stepCountIs(12),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
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
    const cost = estimateCost(llm.provider, tokensIn, tokensOut);

    if (!userHasOwnKey) {
      await logUsage(userId, tokensIn, tokensOut, cost, llm.modelId);
    }

    await sb.from("chat_messages").insert([
      {
        user_id: userId,
        role: "user",
        content: lastUser.content,
        agent_id: agentRecord?.id ?? null,
      },
      {
        user_id: userId,
        role: "assistant",
        content: text,
        agent_id: agentRecord?.id ?? null,
      },
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
    const message = e instanceof Error ? e.message : "LLM request failed";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[chat] main LLM flow error:", {
      message,
      stack,
      userId,
      lastUserMsg: lastUser.content.slice(0, 200),
      agentSlug: agentRecord?.name ?? null,
    });
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
