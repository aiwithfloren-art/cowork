/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { buildTools } from "../src/lib/llm/tools";
import { createClient } from "@supabase/supabase-js";

/**
 * Live-calls generate_image via the tool layer to verify:
 *   - OPENROUTER_API_KEY picked up from env
 *   - Gemini Flash Image responds with an image
 *   - Tool returns a usable URL (either data: or https:)
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user missing");

  const tools = buildTools(user.id as string);
  const gen = (tools as { generate_image?: { execute: Function } })
    .generate_image;
  if (!gen) throw new Error("generate_image tool missing");

  console.log("→ calling generate_image...");
  const t0 = Date.now();
  const result = await gen.execute({
    prompt:
      "A minimalist logo design for a B2B logistics startup called Acme. Clean geometric mark, indigo + cyan accent, flat vector style, white background, professional.",
  });
  const ms = Date.now() - t0;

  console.log(`\n→ elapsed: ${ms}ms`);
  if (result.error) {
    console.log(`✗ error: ${result.error}`);
    process.exit(1);
  }
  if (result.url) {
    const isData = result.url.startsWith("data:");
    const isHttp = result.url.startsWith("http");
    console.log(
      `✓ got url (${isData ? "inline data URI" : isHttp ? "http URL" : "unknown format"}, ${result.url.length} chars)`,
    );
    console.log(`  preview: ${result.url.slice(0, 120)}…`);
    console.log(`\n🎉 generate_image works end-to-end`);
  } else {
    console.log(`✗ no url in response`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
