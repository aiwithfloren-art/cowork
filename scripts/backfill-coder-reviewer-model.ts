/* eslint-disable */
// One-shot: switch Coder + Code Reviewer agents from DeepSeek V3.2 to
// GPT-4o-mini (both provider=openrouter). DeepSeek was ~2-3x slower at
// generating long tool-call arguments (e.g. github_write_files_batch
// with 15 files of source code), which pushed the main Sigap /api/chat
// function past the 300s Vercel serverless cap and caused repeated 504
// timeouts. GPT-4o-mini is fast enough and tool-call reliability on
// OpenAI's stack is more mature for this workload.
//
// Run: npx tsx scripts/backfill-coder-reviewer-gpt4o.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const targets = ["Coder", "Code Reviewer"];
  const newProvider = "openrouter";
  const newModel = "google/gemini-2.5-flash-lite";

  for (const name of targets) {
    const { data: tmpls, error: tErr } = await sb
      .from("org_agent_templates")
      .update({ llm_override_provider: newProvider, llm_override_model: newModel })
      .eq("name", name)
      .select("id");
    if (tErr) throw tErr;

    const { data: agents, error: aErr } = await sb
      .from("custom_agents")
      .update({ llm_override_provider: newProvider, llm_override_model: newModel })
      .eq("name", name)
      .select("id");
    if (aErr) throw aErr;

    console.log(
      `✓ ${name} → ${newModel}: ${tmpls?.length ?? 0} templates, ${agents?.length ?? 0} installed agents`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
