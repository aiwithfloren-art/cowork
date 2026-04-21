import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL } from "@/lib/llm/client";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";

export type RunResult =
  | { ok: true; digestId: string; summary: string }
  | { ok: false; error: string };

/**
 * Runs one agent once — the scheduled "digest" loop. We give the agent
 * its system prompt + objectives + recent workspace state, ask it to
 * write a short digest of what it wants to do, and store that as an
 * agent_digests row. Actions are NOT auto-executed in this MVP — the
 * user reviews and approves from the UI.
 *
 * Keep this side-effect-light: no emails, no calendar writes, no task
 * creation. Those go via the approval UI once we wire it.
 */
export async function runAgent(agentId: string): Promise<RunResult> {
  const sb = supabaseAdmin();
  const { data: agent, error: agentErr } = await sb
    .from("custom_agents")
    .select(
      "id, user_id, slug, name, emoji, system_prompt, enabled_tools, objectives, last_run_at",
    )
    .eq("id", agentId)
    .maybeSingle();
  if (agentErr || !agent) {
    return { ok: false, error: agentErr?.message ?? "Agent not found" };
  }

  const since = agent.last_run_at
    ? new Date(agent.last_run_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const context = await gatherRecentContext(agent.user_id, since);

  const allTools = await buildToolsForUser(agent.user_id);
  // Runner is read-only for now — strip any mutation tools so the agent
  // can't surprise-send emails or delete things during autonomous runs.
  const READ_ONLY = new Set([
    "get_today_schedule",
    "get_week_schedule",
    "find_meeting_slots",
    "list_tasks",
    "list_recent_emails",
    "read_email",
    "list_connected_files",
    "read_connected_file",
    "web_search",
    "get_notes",
    "list_notifications",
    "list_team_members",
    "get_member_workload",
    "list_agents",
  ]);
  const tools = Object.fromEntries(
    Object.entries(allTools).filter(
      ([k]) => (agent.enabled_tools as string[]).includes(k) && READ_ONLY.has(k),
    ),
  ) as typeof allTools;

  const objectivesBlock =
    (agent.objectives ?? []).length > 0
      ? (agent.objectives as string[]).map((o) => `- ${o}`).join("\n")
      : "- (no standing objectives — infer reasonable daily check-ins from the role)";

  const runnerSystem = `${agent.system_prompt}

## Autonomous digest run

You are running in scheduled background mode — nobody is waiting on you live. Your job:
1) Use the read-only tools available to scan the user's current state (calendar, tasks, inbox, notes, team) relevant to YOUR role.
2) Identify things the user should know or act on TODAY.
3) Draft a digest: 3-6 bullet points, each with a concrete recommendation.
4) For each action item, suggest ONE concrete follow-up the user could take (e.g. "Reply to client X", "Reschedule meeting Y").

Do NOT call any tools that mutate state (send email, add task, delete, broadcast). Those are banned for autonomous runs.

Reply in the user's likely language. Keep the digest compact.

## Objectives
${objectivesBlock}

## Recent workspace snapshot
${context}`;

  let text = "";
  try {
    const result = await generateText({
      model: getGroq()(DEFAULT_MODEL),
      system: runnerSystem,
      messages: [
        {
          role: "user",
          content:
            "Run your autonomous digest now. Scan the relevant state, then write the digest.",
        },
      ],
      tools,
      stopWhen: stepCountIs(8),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });
    text = result.text?.trim() || "";
    if (!text) {
      const last = (result.steps ?? [])
        .flatMap((s: { text?: string }) => (s.text ? [s.text] : []))
        .pop();
      text = last ?? "";
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "LLM run failed",
    };
  }

  if (!text) {
    return { ok: false, error: "Empty digest text" };
  }

  const { data: inserted, error: insertErr } = await sb
    .from("agent_digests")
    .insert({
      user_id: agent.user_id,
      agent_id: agent.id,
      summary: text.slice(0, 20000),
      planned_actions: [],
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message ?? "digest insert failed" };
  }

  await sb
    .from("custom_agents")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", agent.id);

  // Notify the owner so they see the digest in their bell.
  await sb.from("notifications").insert({
    user_id: agent.user_id,
    actor_id: null,
    kind: "agent_digest",
    title: `${agent.emoji ?? "🤖"} ${agent.name} — digest baru`,
    body: text.slice(0, 240),
    link: `/agents/${agent.slug}`,
  });

  return { ok: true, digestId: inserted.id, summary: text };
}

async function gatherRecentContext(
  userId: string,
  since: Date,
): Promise<string> {
  const sb = supabaseAdmin();
  const [notif, notes] = await Promise.all([
    sb
      .from("notifications")
      .select("kind, title, body, created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("notes")
      .select("type, content, created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const lines: string[] = [
    `Last run: ${since.toISOString()}`,
    `Now: ${new Date().toISOString()}`,
    "",
    "Recent notifications for the user:",
    ...(notif.data && notif.data.length > 0
      ? notif.data.map((n) => `- [${n.kind}] ${n.title}`)
      : ["(none since last run)"]),
    "",
    "Recent notes captured for the user:",
    ...(notes.data && notes.data.length > 0
      ? notes.data.map(
          (n) => `- [${n.type}] ${(n.content ?? "").slice(0, 80)}`,
        )
      : ["(none since last run)"]),
  ];
  return lines.join("\n");
}
