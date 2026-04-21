/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptMeetingSummary } from "../src/lib/llm/meeting-intercept";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("user not found");
  console.log(`→ user ${user.id}`);

  const cases = [
    { label: "basic", msg: "kasih summary meeting tadi" },
    { label: "short", msg: "summary meeting" },
    { label: "nope", msg: "halo apa kabar" },
  ];

  for (const c of cases) {
    console.log(`\n→ case: ${c.label} — "${c.msg}"`);
    const t0 = Date.now();
    const result = await tryInterceptMeetingSummary(user.id, c.msg);
    const ms = Date.now() - t0;
    console.log(`  ${ms}ms, match=${result !== null}`);
    if (result) console.log(`  reply (first 500 chars):\n${result.slice(0, 500)}`);
  }
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
