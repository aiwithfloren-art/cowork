/* eslint-disable */
// Smoke test: create_team + invite_to_team via Gmail OAuth.
// Creates a test org, invites the owner's own email (safe), verifies Gmail
// send succeeded, and cleans up the test rows.
//
// Run: npx tsx scripts/test-invite-gmail.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { buildTools } from "../src/lib/llm/tools";

const OWNER_EMAIL = "aiwithfloren@gmail.com";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: user, error: userErr } = await sb
    .from("users")
    .select("id, email")
    .eq("email", OWNER_EMAIL)
    .maybeSingle();
  if (userErr || !user) throw new Error(`owner user lookup failed: ${userErr?.message}`);
  console.log(`→ owner userId=${user.id} (${user.email})`);

  const tools = buildTools(user.id);
  const createTeam = (tools as any).create_team;
  const inviteToTeam = (tools as any).invite_to_team;
  if (!createTeam || !inviteToTeam) throw new Error("tools missing");

  const teamName = `AUDIT_TEST_${Date.now()}`;
  console.log(`\n→ create_team "${teamName}"`);
  const t0 = Date.now();
  const createResult = await createTeam.execute({ name: teamName });
  console.log(`← ${Date.now() - t0}ms:`, JSON.stringify(createResult));
  if (!(createResult as any).ok) {
    console.error("FAIL: create_team did not return ok");
    process.exit(1);
  }
  const orgId = (createResult as any).org_id as string;

  console.log(`\n→ invite_to_team (to self: ${OWNER_EMAIL})`);
  const t1 = Date.now();
  const inviteResult = await inviteToTeam.execute({
    email: OWNER_EMAIL,
    org_id: orgId,
    role: "member",
  });
  console.log(`← ${Date.now() - t1}ms:`, JSON.stringify(inviteResult));

  const ok = (inviteResult as any).ok === true;
  const sentVia = (inviteResult as any).sent_via;
  const warning = (inviteResult as any).warning;

  console.log("\n→ cleanup test rows");
  const { error: delInviteErr } = await sb
    .from("org_invites")
    .delete()
    .eq("org_id", orgId);
  const { error: delMembersErr } = await sb
    .from("org_members")
    .delete()
    .eq("org_id", orgId);
  const { error: delOrgErr } = await sb
    .from("organizations")
    .delete()
    .eq("id", orgId);
  console.log(
    `  invites: ${delInviteErr?.message || "ok"}, members: ${delMembersErr?.message || "ok"}, org: ${delOrgErr?.message || "ok"}`,
  );

  if (!ok || sentVia !== "gmail") {
    console.error("\nFAIL: invite result does not indicate successful Gmail send");
    if (warning) console.error("  warning:", warning);
    process.exit(1);
  }

  console.log(
    `\nPASS ✓ create_team + invite_to_team via Gmail worked end-to-end.\n   (check ${OWNER_EMAIL} inbox + Sent folder — an AUDIT_TEST invite should be there)`,
  );
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
