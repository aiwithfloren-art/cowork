import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";
import { generateText } from "ai";
import { getGroq, DEFAULT_MODEL } from "./client";

/**
 * Conversational agent builder. Instead of one-shot extraction, we run a
 * multi-turn Q&A where Sigap asks clarifying questions ("what tasks?",
 * "what tone?", "which tools?") and only commits the agent to the DB
 * once it has enough info.
 *
 * Detection:
 *   - User explicitly starts with "bikin agent / create agent / ..."
 *   - OR previous assistant turn had the builder marker (tag), meaning
 *     we're mid-conversation and should keep the builder in charge.
 *
 * Output format from the planner LLM (JSON, strictly one of two shapes):
 *   {"action": "ask",    "question": "<next clarifying question>"}
 *   {"action": "create", "spec": {name, emoji, description, system_prompt, enabled_tools}}
 */

const BUILDER_TAG = "🤖 Agent Builder:";

// Matches anything that looks like the user wants a new agent. Intentionally
// broad — the LLM planner can still bail out if the intent is off.
const CREATE_PATTERN =
  /\b(bikin|buat|create|make|generate|mau|pengen|pengin|punya|butuh|need|want|new|setup|add)\b[^.?!]{0,80}\b(agent|employee|sub[- ]?agent|asisten|assistant)\b/i;

const ALL_TOOL_SLUGS = [
  "get_today_schedule",
  "get_week_schedule",
  "find_meeting_slots",
  "add_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "list_tasks",
  "add_task",
  "complete_task",
  "update_task",
  "delete_task",
  "list_connected_files",
  "read_connected_file",
  "share_drive_file",
  "list_recent_emails",
  "read_email",
  "send_email",
  "web_search",
  "generate_image",
  "save_note",
  "assign_task_to_member",
  "broadcast_to_team",
  "list_notifications",
  "list_team_members",
  "get_notes",
  "create_team",
  "invite_to_team",
  "start_meeting_bot",
  "get_meeting_summary",
  "list_agents",
  "delete_agent",
] as const;

type Msg = { role: "user" | "assistant"; content: string };

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "agent"
  );
}

function isInBuilderMode(history: Msg[]): boolean {
  // Only check the LATEST assistant message — if the builder finished
  // successfully the most recent reply is a confirmation (starts with ✅)
  // and we should NOT keep intercepting follow-ups like "ok thanks" as
  // further build steps.
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      return history[i].content.includes(BUILDER_TAG);
    }
  }
  return false;
}

export async function tryInterceptAgentCreate(
  userId: string,
  message: string,
  history: Msg[] = [],
): Promise<string | null> {
  const isNewRequest = CREATE_PATTERN.test(message);
  const continueBuilder = isInBuilderMode(history);
  if (!isNewRequest && !continueBuilder) return null;

  const groq = getGroq();
  const toolOptions = ALL_TOOL_SLUGS.join(", ");

  const systemPrompt = `You are Sigap's Agent Builder. The user wants to build a sub-agent (an AI employee with a focused role). Through conversation, gather:

1. **Role / main purpose** — HR, sales, marketing, research, content, customer-support, etc.
2. **Concrete tasks** — 2-5 specific things this agent should do (not generic).
3. **Tone / personality** — formal, casual, strict, friendly. Default to what fits the role if user doesn't care.
4. **Tool needs** — inferred from tasks. You pick from the allowed list below.

Ask ONE focused question at a time, in the user's language. Use short questions. Don't overwhelm.

When you have enough info (role + at least 2 tasks + a name), move to "create".

Available tool slugs:
${toolOptions}

Output STRICT JSON (no markdown fence, no prose):

If you need more info:
{"action":"ask","question":"<your next clarifying question in user's language>"}

If ready to create:
{"action":"create","spec":{
  "name":"<1-2 word human name, e.g. 'Siska' or 'Sales Mike' — invent if user didn't name>",
  "emoji":"<ONE emoji fitting the role>",
  "description":"<one-sentence summary of what agent does, in user's language, <120 chars>",
  "system_prompt":"<3-6 sentence instruction to the agent: role, tasks, tone, boundaries; user's language>",
  "enabled_tools":["tool_slug_1","tool_slug_2",...]
}}

Rules:
- enabled_tools: only slugs from the list above, pick subset relevant to the role.
- Minimum 1 tool.
- Ask at most 3-4 questions total before creating.`;

  const llmMessages: Msg[] = [
    ...history.slice(-8).filter((m) => m.role === "user" || m.role === "assistant"),
    { role: "user", content: message },
  ];

  let planned: unknown;
  try {
    const result = await generateText({
      model: groq(DEFAULT_MODEL),
      system: systemPrompt,
      messages: llmMessages,
    });
    const raw = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    planned = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return `${BUILDER_TAG} Maaf, ada kendala teknis bikin agent (${msg}). Coba ulangi: "bikin agent X buat Y".`;
  }

  const decision = planned as {
    action?: "ask" | "create";
    question?: string;
    spec?: {
      name?: string;
      emoji?: string;
      description?: string;
      system_prompt?: string;
      enabled_tools?: string[];
    };
  };

  if (decision.action === "ask") {
    const q = decision.question?.trim() || "Ceritakan lebih detail dong — agent ini buat apa?";
    return `${BUILDER_TAG} ${q}`;
  }

  if (decision.action !== "create" || !decision.spec) {
    return `${BUILDER_TAG} Aku butuh info lebih — agent ini kepake buat role apa? (HR, sales, content, dll)`;
  }

  const spec = decision.spec;
  if (!spec.name || !spec.system_prompt) {
    return `${BUILDER_TAG} Hampir siap, tapi aku belum punya nama agent-nya. Mau dikasih nama apa?`;
  }

  let enabledTools = Array.isArray(spec.enabled_tools)
    ? spec.enabled_tools.filter((t) =>
        (ALL_TOOL_SLUGS as readonly string[]).includes(t),
      )
    : [];
  if (enabledTools.length === 0) {
    enabledTools = ["save_note", "web_search"];
  }

  const sb = supabaseAdmin();
  const baseSlug = slugify(spec.name);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await sb
      .from("custom_agents")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  const { data: created, error } = await sb
    .from("custom_agents")
    .insert({
      user_id: userId,
      slug,
      name: spec.name,
      emoji: spec.emoji ?? "🤖",
      description: spec.description ?? null,
      system_prompt: spec.system_prompt,
      enabled_tools: enabledTools,
    })
    .select("slug, name, emoji")
    .single();

  if (error || !created) {
    return `⚠️ Gagal simpan agent: ${error?.message || "unknown"}`;
  }

  const toolList =
    enabledTools.slice(0, 6).join(", ") +
    (enabledTools.length > 6 ? `, +${enabledTools.length - 6} lainnya` : "");

  return `✅ ${created.emoji} **${created.name}** siap!

${spec.description ?? ""}

**Tools:** ${toolList}

Chat sama dia di → **/agents/${created.slug}**`;
}
