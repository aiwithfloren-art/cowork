/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

/**
 * One-shot: existing Coder templates + installed Coder agents predate the
 * http_request / get_credential / list_credentials tools. Add them to
 * enabled_tools so Coder can actually deploy-to-any-service via the
 * composition pattern (not just push to GitHub).
 */
const EXTRA = ["http_request", "get_credential", "list_credentials"];

async function mergeTools(
  sb: ReturnType<typeof createClient>,
  table: "org_agent_templates" | "custom_agents",
  name: string,
): Promise<number> {
  const { data } = await sb
    .from(table)
    .select("id, enabled_tools")
    .eq("name", name);
  let n = 0;
  for (const row of data ?? []) {
    const current = (row.enabled_tools as string[] | null) ?? [];
    const next = Array.from(new Set([...current, ...EXTRA]));
    if (next.length === current.length) continue;
    await sb
      .from(table)
      .update({ enabled_tools: next })
      .eq("id", row.id as string);
    n++;
  }
  return n;
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const t = await mergeTools(sb, "org_agent_templates", "Coder");
  const a = await mergeTools(sb, "custom_agents", "Coder");
  console.log(`✓ Coder: templates updated=${t}, agents updated=${a}`);
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
