/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { runAgent } from "../src/lib/agents/runner";
import { cronMatchesNow } from "../src/app/api/cron/agent-runner/route";

async function main() {
  // Cron matcher sanity
  console.log("→ cron matcher tests");
  const now = new Date("2026-04-21T01:30:00Z"); // 08:30 WIB Tuesday
  const checks = [
    ["30 1 * * *", true], // daily 01:30 UTC
    ["30 1 * * 1-5", true], // weekdays 01:30 UTC (Tue = 2)
    ["0 * * * *", false], // every hour at :00 (now is :30)
    ["30 * * * *", true], // every hour at :30
    ["* * * * *", true],
    ["30 1 * * 0", false], // Sunday only
    ["0/15 * * * *", false], // every 15 min from 0
    ["30/15 * * * *", true], // from 30 in 15-min steps (30, 45)
  ];
  for (const [cron, want] of checks) {
    const got = cronMatchesNow(cron as string, now);
    console.log(`  ${got === want ? "✓" : "✗"} ${cron}: ${got} (want ${want})`);
  }

  // Real run — create agent, run it, verify digest exists
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

  // Clean existing test agents
  await sb.from("custom_agents").delete().eq("user_id", user.id);

  // Create test agent directly
  const { data: created } = await sb
    .from("custom_agents")
    .insert({
      user_id: user.id,
      slug: "test-runner-siska",
      name: "Test Siska",
      emoji: "🧑‍💼",
      description: "HR test agent",
      system_prompt:
        "Kamu adalah asisten HR bernama Siska. Tugas: review kondisi HR dan berikan digest harian singkat.",
      enabled_tools: ["list_tasks", "get_today_schedule", "get_notes", "list_notifications"],
      objectives: ["Review task overdue", "Surface notes HR"],
    })
    .select("id, slug")
    .single();
  if (!created) throw new Error("create failed");
  console.log(`\n→ agent created: ${created.id}`);

  console.log("→ running agent…");
  const t0 = Date.now();
  const r = await runAgent(created.id);
  console.log(`← ${Date.now() - t0}ms:`, r.ok ? "OK" : `FAIL: ${r.error}`);
  if (r.ok) {
    console.log(`  digest preview: ${r.summary.slice(0, 300)}...`);
  }

  const { data: digests } = await sb
    .from("agent_digests")
    .select("id, summary, status, created_at")
    .eq("agent_id", created.id);
  console.log(`\n→ digests in DB: ${digests?.length ?? 0}`);

  const { data: notifs } = await sb
    .from("notifications")
    .select("kind, title")
    .eq("user_id", user.id)
    .eq("kind", "agent_digest")
    .order("created_at", { ascending: false })
    .limit(1);
  console.log(`→ notifications: ${notifs?.length ?? 0} agent_digest`);

  console.log("\n→ cleanup");
  await sb.from("custom_agents").delete().eq("id", created.id);
  await sb
    .from("notifications")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "agent_digest");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  process.exit(1);
});
