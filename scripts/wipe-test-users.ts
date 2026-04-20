/* eslint-disable */
// One-off: wipe test users + their data from Cowork DB so we can re-onboard
// from scratch. Cascade delete handles most dependents. Also cleans up orphan
// organizations whose only members were these users.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EMAILS = ["aiwithfloren@gmail.com", "humanevaluationofficial@gmail.com"];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  console.log("=== PREVIEW (what will be deleted) ===\n");

  const { data: users } = await sb
    .from("users")
    .select("id, name, email")
    .in("email", EMAILS);
  console.log(`users (${users?.length ?? 0}):`, users);

  if (!users || users.length === 0) {
    console.log("\n✓ Nothing to delete. Already clean.");
    return;
  }

  const userIds = users.map((u) => u.id);

  const counts = await Promise.all([
    sb.from("google_tokens").select("user_id", { count: "exact", head: true }).in("user_id", userIds),
    sb.from("connectors").select("user_id", { count: "exact", head: true }).in("user_id", userIds),
    sb.from("user_files").select("user_id", { count: "exact", head: true }).in("user_id", userIds),
    sb.from("notes").select("user_id", { count: "exact", head: true }).in("user_id", userIds),
    sb.from("org_members").select("user_id", { count: "exact", head: true }).in("user_id", userIds),
  ]);
  console.log("google_tokens:", counts[0].count);
  console.log("connectors (incl. slack):", counts[1].count);
  console.log("user_files:", counts[2].count);
  console.log("notes:", counts[3].count);
  console.log("org_members:", counts[4].count);

  const { data: orgs } = await sb
    .from("organizations")
    .select("id, name, owner_id")
    .in("owner_id", userIds);
  console.log(`organizations owned by these users (${orgs?.length ?? 0}):`, orgs);

  console.log("\n=== DELETING ===\n");

  if (orgs && orgs.length > 0) {
    const orgIds = orgs.map((o) => o.id);
    const { error: orgErr } = await sb.from("organizations").delete().in("id", orgIds);
    if (orgErr) throw new Error(`org delete failed: ${orgErr.message}`);
    console.log(`✓ deleted ${orgIds.length} organizations (cascaded to org_members)`);
  }

  const { error: userErr } = await sb.from("users").delete().in("id", userIds);
  if (userErr) throw new Error(`user delete failed: ${userErr.message}`);
  console.log(`✓ deleted ${userIds.length} users (cascaded to google_tokens, connectors, user_files, notes, etc.)`);

  console.log("\n=== VERIFY CLEAN ===\n");
  const { data: leftover } = await sb
    .from("users")
    .select("id, email")
    .in("email", EMAILS);
  console.log("users remaining with these emails:", leftover?.length ?? 0);

  console.log("\n✓ Wipe complete. Ready for fresh signup.");
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
