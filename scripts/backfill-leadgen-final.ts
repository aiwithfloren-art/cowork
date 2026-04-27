/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { STARTER_TEMPLATES } from "../src/lib/starter-kit";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const lg = STARTER_TEMPLATES.find(t => t.name === "Lead Gen")!;
  const { data: t } = await sb.from("org_agent_templates")
    .update({ system_prompt: lg.role, llm_override_provider: lg.llm_override_provider, llm_override_model: lg.llm_override_model })
    .eq("name", "Lead Gen").select("id");
  const { data: a } = await sb.from("custom_agents")
    .update({ system_prompt: lg.role, llm_override_provider: lg.llm_override_provider, llm_override_model: lg.llm_override_model })
    .eq("name", "Lead Gen").select("id");
  console.log(`✓ Lead Gen → ${lg.llm_override_model}: ${t?.length} tmpls, ${a?.length} installs`);
}
main().catch(e => { console.error(e); process.exit(1); });
