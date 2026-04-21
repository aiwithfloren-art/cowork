import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";
import { generateText } from "ai";
import { getGroq, DEFAULT_MODEL } from "./client";

/**
 * Bypass for "bikin agent X" / "create agent X" — Kimi K2 is unreliable
 * at calling tools. When the user clearly wants to create a sub-agent,
 * we run a structured generation to extract name + description + a
 * focused system prompt + a tool subset, and write directly to the DB.
 *
 * The user can later refine the agent by chatting with it (handled by
 * a separate edit intercept — not here).
 */
const CREATE_PATTERN =
  /\b(bikin|buat|create|make|generate)\s+(agent|employee|sub[- ]?agent|asisten)\b/i;

// The full catalogue of tools an agent can be granted. Must match the
// keys returned by buildTools().
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

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "agent"
  );
}

export async function tryInterceptAgentCreate(
  userId: string,
  message: string,
): Promise<string | null> {
  if (!CREATE_PATTERN.test(message)) return null;

  const groq = getGroq();
  const toolOptions = ALL_TOOL_SLUGS.join(", ");

  const systemPrompt = `You extract specs for creating a user sub-agent. Reply with ONLY valid JSON (no markdown fence, no prose before/after). The JSON must have exactly these keys:

{
  "name": "<1-2 word human name like 'Siska' or 'Sales Mike'>",
  "emoji": "<ONE emoji matching the role>",
  "description": "<one sentence, <120 chars, same language as user>",
  "system_prompt": "<3-6 sentence instructions for the agent in the user's language>",
  "enabled_tools": ["tool_slug_1", "tool_slug_2", ...]
}

Available tool slugs to choose from (pick a relevant subset — HR: team+email+calendar, Sales: email+calendar+web_search, Content: generate_image+web_search+save_note):
${toolOptions}

Rules:
- If user didn't give a name, invent a short fitting one.
- Never include tool slugs outside the list above.
- enabled_tools must have at least 1 item.
- Output JSON only.`;

  let spec: {
    name: string;
    emoji: string;
    description: string;
    system_prompt: string;
    enabled_tools: string[];
  };
  try {
    const result = await generateText({
      model: groq(DEFAULT_MODEL),
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });
    const raw = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    spec = JSON.parse(raw);
    if (!spec.name || !spec.system_prompt) {
      throw new Error("missing required fields");
    }
    if (!Array.isArray(spec.enabled_tools)) spec.enabled_tools = [];
    spec.enabled_tools = spec.enabled_tools.filter((t) =>
      (ALL_TOOL_SLUGS as readonly string[]).includes(t),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return `⚠️ Gagal bikin agent (model error): ${msg}`;
  }

  if (!spec.enabled_tools || spec.enabled_tools.length === 0) {
    spec.enabled_tools = ["save_note", "web_search"];
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
      emoji: spec.emoji,
      description: spec.description,
      system_prompt: spec.system_prompt,
      enabled_tools: spec.enabled_tools,
    })
    .select("slug, name, emoji")
    .single();

  if (error || !created) {
    return `⚠️ Gagal simpan agent: ${error?.message || "unknown"}`;
  }

  const toolList = spec.enabled_tools.slice(0, 6).join(", ") +
    (spec.enabled_tools.length > 6 ? `, +${spec.enabled_tools.length - 6} lainnya` : "");

  return `✅ ${created.emoji} **${created.name}** siap!

${spec.description}

**Tools yang dia punya:** ${toolList}

Chat sama dia di → **/agents/${created.slug}**
Atau ganti nanti kalau mau — tinggal ketik "edit agent ${created.name}" di sini.`;
}
