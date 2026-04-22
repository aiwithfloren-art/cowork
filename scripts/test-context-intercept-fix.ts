/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptCompanyContext } from "../src/lib/llm/company-context-intercept";

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
  if (!user) throw new Error("user missing");

  // Wipe profile to simulate fresh
  const { data: mem } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  await sb
    .from("organizations")
    .update({ description: null, brand_tone: null })
    .eq("id", mem!.org_id);

  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];
  const turns = [
    'Bikin carousel 5 slide tentang "5 red flags saat hire founding engineer startup", palette indigo, aspect 1:1, tone confident tapi tidak arrogant.',
    "Companydemo = platform AI assistant buat tim B2B kecil. Target: early-stage founder Indo yang butuh productivity.",
    "confident tapi tidak arrogant, casual-professional, hindari jargon",
  ];

  for (const input of turns) {
    console.log(`\n👤 USER: ${input.slice(0, 80)}…`);
    const t0 = Date.now();
    const reply = await tryInterceptCompanyContext(user.id as string, input, transcript);
    const ms = Date.now() - t0;
    if (!reply) {
      console.log(`  (intercept didn't fire)`);
      break;
    }
    console.log(`🤖 SIGAP [${ms}ms]:`);
    // Show raw to see if HTML comment is there
    console.log(`  RAW: ${reply.slice(0, 200)}${reply.length > 200 ? "..." : ""}`);
    // Render simulation: strip HTML comments
    const visible = reply.replace(/<!--.*?-->\s*/g, "");
    console.log(`  VISIBLE (what user sees): ${visible}`);
    transcript.push({ role: "user", content: input });
    transcript.push({ role: "assistant", content: reply });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
