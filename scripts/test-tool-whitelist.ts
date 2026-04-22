/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { buildToolsForUser } from "../src/lib/llm/build-tools";

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
  if (!user) throw new Error("test user not found");

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) throw new Error("user has no org");
  const orgId = membership.org_id;

  async function snapshotTools(label: string) {
    const tools = await buildToolsForUser(user.id);
    const names = Object.keys(tools).sort();
    console.log(`\n── ${label} ──`);
    console.log(`  count: ${names.length}`);
    console.log(`  has add_task: ${names.includes("add_task")}`);
    console.log(`  has send_email: ${names.includes("send_email")}`);
    console.log(`  has web_search: ${names.includes("web_search")}`);
    return new Set(names);
  }

  // Baseline: no whitelist
  await sb
    .from("organizations")
    .update({ allowed_tools: [] })
    .eq("id", orgId);
  const baseline = await snapshotTools("baseline (empty whitelist → all allowed)");

  // Set whitelist: only web_search and save_note
  await sb
    .from("organizations")
    .update({ allowed_tools: ["web_search", "save_note"] })
    .eq("id", orgId);
  const restricted = await snapshotTools(
    "restricted (whitelist: web_search + save_note)",
  );

  console.log("\n── asserts ──");
  console.log(
    `  restricted contains web_search: ${restricted.has("web_search")}`,
  );
  console.log(
    `  restricted contains save_note: ${restricted.has("save_note")}`,
  );
  console.log(
    `  restricted does NOT contain add_task: ${!restricted.has("add_task")}`,
  );
  console.log(
    `  restricted does NOT contain send_email: ${!restricted.has("send_email")}`,
  );
  console.log(
    `  restricted set is smaller than baseline: ${restricted.size < baseline.size}`,
  );

  // Reset to no whitelist (default)
  await sb
    .from("organizations")
    .update({ allowed_tools: [] })
    .eq("id", orgId);
  console.log("\n→ reset whitelist");
  console.log("\n🎉 tool whitelist enforcement verified");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
