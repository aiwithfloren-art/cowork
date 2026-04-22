/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Revert org LLM policy back to Groq (cheapest). OPENROUTER_API_KEY stays
 * in env — generate_image tool reads it directly, independent of org LLM
 * choice. So: chat uses Groq (cheap), image gen uses OpenRouter (only path).
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
        llm_provider: "groq",
        llm_model: null,  // uses DEFAULT_MODEL = openai/gpt-oss-120b
        llm_api_key: null, // falls back to GROQ_API_KEY env
      })
      .eq("id", org.id);
    console.log(`  ${error ? "✗" : "✓"} ${org.name}${error ? ": " + error.message : ""}`);
  }
  console.log("\n🎉 reverted to Groq");
}
main().catch((e) => { console.error(e); process.exit(1); });
