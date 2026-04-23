/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

/**
 * One-shot backfill: set DeepSeek V3.2 override on every "Coder" and
 * "Code Reviewer" template/agent already in the DB. Earlier seed didn't
 * have the override columns yet, so this brings them in line with new
 * installs that will pick it up automatically via starter-kit.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const override = {
    llm_override_provider: "openrouter",
    llm_override_model: "deepseek/deepseek-v3.2",
  };
  const names = ["Coder", "Code Reviewer"];

  for (const name of names) {
    const tmplRes = await sb
      .from("org_agent_templates")
      .update(override)
      .eq("name", name)
      .select("id, org_id");
    console.log(
      `  template "${name}" → updated ${tmplRes.data?.length ?? 0} row(s)`,
    );

    const agentRes = await sb
      .from("custom_agents")
      .update(override)
      .eq("name", name)
      .select("id, slug, user_id");
    console.log(
      `  custom_agent "${name}" → updated ${agentRes.data?.length ?? 0} row(s)`,
    );
  }
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
