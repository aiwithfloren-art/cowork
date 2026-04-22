/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Switch every org to OpenRouter + gpt-4o-mini to escape Groq's 8K TPM
 * free-tier limit. Same $/token as Groq oss-120b but higher per-minute
 * throughput + OpenAI-grade tool calling. Platform OPENROUTER_API_KEY
 * (in env) is used — no per-org key needed.
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
        llm_model: "openai/gpt-4o-mini",
      })
      .eq("id", org.id);
    console.log(
      `  ${error ? "✗" : "✓"} ${org.name}${error ? ": " + error.message : ""}`,
    );
  }
  console.log("\n🎉 switched to OpenRouter + gpt-4o-mini");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
