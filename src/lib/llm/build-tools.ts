import { buildTools } from "./tools";
import { buildSlackTools } from "@/lib/slack/tools";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getComposioTools } from "@/lib/composio/tools";

/**
 * Builds the full tool set for a user, including any connector tools
 * they have OAuth'd. Called from the chat route and the Telegram
 * webhook so both surfaces pick up the same extensions automatically.
 *
 * Applies the org's tool whitelist (admin console, allowed_tools column)
 * when one is set. Empty whitelist = no restriction (default). This is
 * the enforcement point — the admin UI just records the policy; this is
 * where it actually prevents tools from reaching the LLM.
 */
export async function buildToolsForUser(
  userId: string,
  agentContext?: { name?: string },
) {
  const base = buildTools(userId, agentContext);

  const sb = supabaseAdmin();
  const { data: connections } = await sb
    .from("connectors")
    .select("provider")
    .eq("user_id", userId);

  const providers = new Set((connections ?? []).map((c) => c.provider));
  let extras: Record<string, unknown> = {};

  if (providers.has("slack")) {
    extras = { ...extras, ...buildSlackTools(userId) };
  }

  // Personal Composio tools (user's own Notion page, personal Gmail, etc.)
  const composioPersonal = await getComposioTools(userId);
  extras = { ...extras, ...composioPersonal };

  // Org-shared Composio tools (team Notion workspace, team Slack, team
  // Linear, etc.). Entity is literal `org_<orgId>` — see
  // /api/team/composio/connect where these are created. Merged AFTER
  // personal so org takes precedence if both expose the same slug (org
  // Notion is usually the more useful one for agent work).
  const orgId = await loadPrimaryOrgId(userId);
  if (orgId) {
    const composioOrg = await getComposioTools(`org_${orgId}`);
    extras = { ...extras, ...composioOrg };
  }

  const full = { ...base, ...extras };

  // Apply org tool whitelist if the user's primary org has one configured.
  // Only applies to "base" tool slugs (the named tools in tools.ts).
  // Connector tools (Slack, Composio) have dynamic slugs and stay pass-through
  // for now — restrict those by disabling the connector itself.
  const allowed = await loadOrgAllowedTools(userId);
  if (!allowed || allowed.length === 0) return full;

  const baseKeys = new Set(Object.keys(base));
  const allowedSet = new Set(allowed);
  const filtered: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(full)) {
    if (!baseKeys.has(name) || allowedSet.has(name)) {
      filtered[name] = tool;
    }
  }
  return filtered as typeof full;
}

async function loadOrgAllowedTools(
  userId: string,
): Promise<string[] | null> {
  try {
    const sb = supabaseAdmin();
    const { data: membership } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!membership?.org_id) return null;
    const { data: org } = await sb
      .from("organizations")
      .select("allowed_tools")
      .eq("id", membership.org_id)
      .maybeSingle();
    return (org?.allowed_tools as string[] | null) ?? null;
  } catch (e) {
    console.error(
      "[build-tools] allowed_tools lookup failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

async function loadPrimaryOrgId(userId: string): Promise<string | null> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return (data?.org_id as string | null) ?? null;
  } catch {
    return null;
  }
}
