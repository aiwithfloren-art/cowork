/* eslint-disable */
// Smoke test for generate_image tool end-to-end.
// Exercises: OpenRouter API key, Gemini model, Supabase Storage upload,
// bucket creation if missing, public URL accessibility.
// Run: npx tsx scripts/test-image-gen.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { buildTools } from "../src/lib/llm/tools";

async function main() {
  const userId =
    process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000001";
  const tools = buildTools(userId);
  const gen = (tools as any).generate_image;
  if (!gen) throw new Error("generate_image tool not found");

  console.log("→ Generating image…");
  const t0 = Date.now();
  const result = await gen.execute({
    prompt: "a minimalist red apple on a white table, studio lighting",
  });
  const ms = Date.now() - t0;
  console.log(`← Done in ${ms}ms\n`);
  console.log(JSON.stringify(result, null, 2));

  if ((result as any).error) {
    console.error("\nFAIL:", (result as any).error);
    process.exit(1);
  }

  const url = (result as any).url as string;
  if (!url?.startsWith("http")) {
    console.error("\nFAIL: returned URL is not a real URL:", url);
    process.exit(1);
  }

  console.log("\n→ HEAD check on public URL…");
  const head = await fetch(url, { method: "HEAD" });
  console.log(`← ${head.status} ${head.statusText}`);
  const ct = head.headers.get("content-type");
  const len = head.headers.get("content-length");
  console.log(`  content-type: ${ct}`);
  console.log(`  content-length: ${len}`);

  if (!head.ok) {
    console.error("\nFAIL: URL not publicly accessible");
    process.exit(1);
  }
  if (!ct?.startsWith("image/")) {
    console.error("\nFAIL: URL does not serve an image");
    process.exit(1);
  }

  console.log("\nPASS ✓ Image generated, stored, and publicly fetchable.");
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
