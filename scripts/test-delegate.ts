/* eslint-disable */
// Directly invoke tryInterceptDelegation as if the manager sent a chat.
// Bypasses HTTP + auth + deploy — proves the tool logic works.
// Run: npx tsx scripts/test-delegate.ts

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const MANAGER_EMAIL = "humanevaluationofficial@gmail.com";
  const { data: manager } = await sb
    .from("users")
    .select("id, name")
    .eq("email", MANAGER_EMAIL)
    .maybeSingle();
  if (!manager) throw new Error(`manager ${MANAGER_EMAIL} not found`);
  console.log(`acting as: ${manager.name} (${manager.id})`);

  const { tryInterceptDelegation } = await import("../src/lib/llm/delegate-intercept");

  const userMessage =
    "kasih task ke aiwithfloren@gmail.com: bypass verification test deadline Jumat";
  console.log(`\nuser message: "${userMessage}"\n`);

  const reply = await tryInterceptDelegation(manager.id, userMessage);
  console.log("=== reply ===");
  console.log(reply);
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
