/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Switch every org's LLM policy to DeepSeek V3.1 via OpenRouter. Falls back
 * to the platform OPENROUTER_API_KEY (stored in env) so we don't duplicate
 * the key in DB.
 *
 * To revert: set llm_provider back to 'groq', llm_model = null.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: orgs } = await sb.from("organizations").select("id, name");
  if (!orgs || orgs.length === 0) {
    console.log("No orgs to update.");
    return;
  }

  console.log(`Switching ${orgs.length} org(s) to DeepSeek V3 via OpenRouter…\n`);
  for (const org of orgs) {
    const { error } = await sb
      .from("organizations")
      .update({
        llm_provider: "openrouter",
        llm_model: "deepseek/deepseek-chat-v3",
        // llm_api_key stays null → provider resolver falls back to env
      })
      .eq("id", org.id);
    if (error) {
      console.log(`  ✗ ${org.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${org.name}`);
    }
  }
  console.log("\n🎉 switched");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
