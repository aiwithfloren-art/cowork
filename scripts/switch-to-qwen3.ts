/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Switch every org to Alibaba's Qwen3-235B-A22B via OpenRouter.
 * Chinese-made MoE model, strong on Bahasa Indonesia out of the box,
 * comparable pricing to gpt-4o-mini, solid tool calling.
 *
 * Revert: scripts/revert-llm-groq.ts
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: orgs } = await sb.from("organizations").select("id, name");
  for (const org of orgs ?? []) {
    const { error } = await sb
      .from("organizations")
      .update({
        llm_provider: "openrouter",
        llm_model: "qwen/qwen3-235b-a22b",
      })
      .eq("id", org.id);
    console.log(
      `  ${error ? "✗" : "✓"} ${org.name}${error ? ": " + error.message : ""}`,
    );
  }
  console.log("\n🎉 switched to Qwen3 235B via OpenRouter");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
