/* eslint-disable */
// One-shot: update existing Coder templates + installed Coder agents
// with the new system_prompt that NEVER polls Vercel deployment status
// and ALWAYS uses schedule_deploy_watcher to avoid 300s serverless
// timeout on landing-page builds.
//
// Run: npx tsx scripts/backfill-coder-no-poll.ts

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

  const coder = STARTER_TEMPLATES.find((t) => t.name === "Coder");
  if (!coder) {
    console.error("Coder not found in STARTER_TEMPLATES");
    process.exit(1);
  }

  const newPrompt = coder.role;

  // org_agent_templates
  const { data: tmpls, error: tErr } = await sb
    .from("org_agent_templates")
    .update({ system_prompt: newPrompt })
    .eq("name", "Coder")
    .select("id");
  if (tErr) throw tErr;

  // custom_agents (installed per user)
  const { data: agents, error: aErr } = await sb
    .from("custom_agents")
    .update({ system_prompt: newPrompt })
    .eq("name", "Coder")
    .select("id");
  if (aErr) throw aErr;

  console.log(
    `✓ Coder system_prompt updated: ${tmpls?.length ?? 0} org templates, ${agents?.length ?? 0} installed agents`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
