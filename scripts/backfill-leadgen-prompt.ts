/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { STARTER_TEMPLATES } from "../src/lib/starter-kit";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const lg = STARTER_TEMPLATES.find(t => t.name === "Lead Gen");
  if (!lg) throw new Error("Lead Gen not in STARTER_TEMPLATES");
  const newPrompt = lg.role;

  const { data: t } = await sb.from("org_agent_templates")
    .update({ system_prompt: newPrompt }).eq("name", "Lead Gen").select("id");
  const { data: a } = await sb.from("custom_agents")
    .update({ system_prompt: newPrompt }).eq("name", "Lead Gen").select("id");
  console.log(`✓ Lead Gen prompt: ${t?.length ?? 0} templates, ${a?.length ?? 0} installs (len=${newPrompt.length})`);
}
main().catch(e => { console.error(e); process.exit(1); });
