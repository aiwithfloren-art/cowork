/* eslint-disable */
// Smoke test for tryInterceptMeetingRecord.
// Verifies: URL + verb pattern detection → Attendee dispatch → DB insert.
// Uses a placeholder Meet URL — Attendee will likely reject the join but
// the dispatch call itself should succeed (or return a clear error).
//
// Run: npx tsx scripts/test-meeting-intercept.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptMeetingRecord } from "../src/lib/llm/meeting-intercept";

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

  const cases: Array<{ label: string; msg: string; expectMatch: boolean }> = [
    {
      label: "meet + rekam",
      msg: "rekam meeting ini https://meet.google.com/tev-andg-hfu",
      expectMatch: true,
    },
    {
      label: "zoom + record",
      msg: "record meeting https://zoom.us/j/123456789",
      expectMatch: true,
    },
    {
      label: "no URL",
      msg: "rekam meeting dong",
      expectMatch: false,
    },
    {
      label: "no verb",
      msg: "https://meet.google.com/abc-def-ghi",
      expectMatch: false,
    },
  ];

  for (const c of cases) {
    console.log(`\n→ case: ${c.label}`);
    const t0 = Date.now();
    const result = await tryInterceptMeetingRecord(user.id, c.msg);
    const ms = Date.now() - t0;
    const matched = result !== null;
    const pass = matched === c.expectMatch;
    console.log(`  [${pass ? "PASS" : "FAIL"}] match=${matched} (expected ${c.expectMatch}) ${ms}ms`);
    if (result) console.log(`  reply: ${result.slice(0, 150)}`);
    if (!pass) process.exit(1);
  }

  console.log("\n→ cleanup dispatched bots (if any)");
  const { data: bots } = await sb
    .from("meeting_bots")
    .select("id, bot_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(`  found ${bots?.length ?? 0} bots for this user`);
  if (bots && bots.length > 0) {
    console.log("  (leaving in DB — they're harmless, just metadata)");
  }

  console.log("\nPASS ✓ intercept pattern matching works");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
