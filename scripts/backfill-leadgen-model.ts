/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const provider = "openrouter";
  const model = "openai/gpt-4o-mini";

  const { data: t } = await sb.from("org_agent_templates")
    .update({ llm_override_provider: provider, llm_override_model: model })
    .eq("name", "Lead Gen").select("id");
  const { data: a } = await sb.from("custom_agents")
    .update({ llm_override_provider: provider, llm_override_model: model })
    .eq("name", "Lead Gen").select("id");
  console.log(`✓ Lead Gen → ${model}: ${t?.length ?? 0} templates, ${a?.length ?? 0} installs`);
}
main().catch(e => { console.error(e); process.exit(1); });
