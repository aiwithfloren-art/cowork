/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

/**
 * Add generate_carousel_html to the enabled_tools of every existing
 * Content Drafter template. Users who've already activated Content Drafter
 * don't auto-get this yet (installs are forks) — they'd need to re-install
 * or we can add a follow-up to also patch their custom_agents row.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Update templates
  const { data: tmpls } = await sb
    .from("org_agent_templates")
    .select("id, org_id, enabled_tools")
    .eq("name", "Content Drafter");
  for (const t of tmpls ?? []) {
    const tools = new Set((t.enabled_tools as string[]) ?? []);
    tools.add("generate_carousel_html");
    await sb
      .from("org_agent_templates")
      .update({ enabled_tools: Array.from(tools) })
      .eq("id", t.id);
    console.log(`  ✓ template ${t.id} updated`);
  }
  // Update already-installed custom_agents too (they're forks but for UX
  // we want existing users to pick this up without re-install)
  const { data: installed } = await sb
    .from("custom_agents")
    .select("id, enabled_tools")
    .eq("name", "Content Drafter");
  for (const a of installed ?? []) {
    const tools = new Set((a.enabled_tools as string[]) ?? []);
    tools.add("generate_carousel_html");
    await sb
      .from("custom_agents")
      .update({ enabled_tools: Array.from(tools) })
      .eq("id", a.id);
    console.log(`  ✓ installed agent ${a.id} updated`);
  }
  console.log("🎉 done");
}
main().catch((e) => { console.error(e); process.exit(1); });
