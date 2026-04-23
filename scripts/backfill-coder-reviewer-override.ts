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

  const base = {
    llm_override_provider: "openrouter",
    llm_override_model: "deepseek/deepseek-v3.2",
  };

  // Coder: DeepSeek override, NO schedule (on-demand only)
  {
    const tmplRes = await sb
      .from("org_agent_templates")
      .update(base)
      .eq("name", "Coder")
      .select("id");
    const agentRes = await sb
      .from("custom_agents")
      .update(base)
      .eq("name", "Coder")
      .select("id");
    console.log(
      `  Coder: ${tmplRes.data?.length ?? 0} template / ${agentRes.data?.length ?? 0} installed`,
    );
  }

  // Reviewer: DeepSeek + daily 09:00 WIB autonomous schedule
  {
    const reviewerUpdate = {
      ...base,
      default_schedule: "0 2 * * *",
    };
    const tmplRes = await sb
      .from("org_agent_templates")
      .update(reviewerUpdate)
      .eq("name", "Code Reviewer")
      .select("id");

    // Installed Reviewer agents: set schedule_cron (not default_schedule —
    // that field only lives on templates). Use same DeepSeek override.
    const agentRes = await sb
      .from("custom_agents")
      .update({ ...base, schedule_cron: "0 2 * * *" })
      .eq("name", "Code Reviewer")
      .select("id");
    console.log(
      `  Code Reviewer: ${tmplRes.data?.length ?? 0} template / ${agentRes.data?.length ?? 0} installed`,
    );
  }
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
