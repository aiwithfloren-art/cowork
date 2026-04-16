import { buildTools } from "./tools";
import { buildSlackTools } from "@/lib/slack/tools";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Builds the full tool set for a user, including any connector tools
 * they have OAuth'd. Called from the chat route and the Telegram
 * webhook so both surfaces pick up the same extensions automatically.
 */
export async function buildToolsForUser(userId: string) {
  const base = buildTools(userId);

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

  return { ...base, ...extras };
}
