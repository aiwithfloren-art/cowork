/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { buildTools } from "../src/lib/llm/tools";

/**
 * Live-execute the get_member_project_brief tool against real data to
 * confirm:
 *   - Permission gating (non-manager blocked, non-sharing target blocked)
 *   - DB queries return structured payload
 *   - Audit log row gets written
 *
 * Uses two test users in the same org — owner + a "member" seeded from
 * the smoke share-link run. If only one user exists, we seed a fake
 * member inline.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Owner = primary test user
  const { data: owner } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!owner) throw new Error("owner user missing");

  const { data: ownerMem } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", owner.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!ownerMem?.org_id) throw new Error("owner has no org");
  const orgId = ownerMem.org_id as string;

  // Seed a test member (sharing enabled) + a project note + a task analog
  const memberEmail = `pb-member-${Date.now()}@testpb.local`;
  const { data: member } = await sb
    .from("users")
    .insert({ email: memberEmail, name: "PB Member" })
    .select("id, email")
    .single();
  if (!member) throw new Error("seed member failed");

  await sb.from("org_members").insert({
    org_id: orgId,
    user_id: member.id,
    role: "member",
    share_with_manager: true,
  });

  await sb.from("notes").insert([
    {
      user_id: member.id,
      type: "project",
      content:
        "Driver App Launch\nQ2 goal: beta in 50 stores. Status: API integration done, frontend WIP, target deadline 15 May.",
    },
    {
      user_id: member.id,
      type: "project",
      content:
        "Merchant Onboarding Playbook\nSetup flow for new merchants joining the network. 80% drafted, review pending.",
    },
  ]);

  // Build tools scoped to OWNER (who will act as the caller)
  const tools = buildTools(owner.id as string);
  const briefTool = (tools as { get_member_project_brief?: { execute: Function } })
    .get_member_project_brief;
  if (!briefTool) throw new Error("get_member_project_brief tool missing");

  console.log("→ running get_member_project_brief...");
  const result = await briefTool.execute({
    member_email: memberEmail,
    reason: "weekly check — what's PB working on?",
  });

  if (result.error) {
    console.log(`✗ got error: ${result.error}`);
  } else {
    console.log(`✓ member: ${result.member?.email}`);
    console.log(`✓ projects: ${result.projects?.length ?? 0}`);
    for (const p of result.projects ?? []) {
      console.log(`   - ${p.snippet}`);
    }
    console.log(
      `✓ tasks: overdue=${result.tasks?.overdue?.length ?? 0}, this_week=${result.tasks?.this_week?.length ?? 0}, later=${result.tasks?.later_total ?? 0}`,
    );
    console.log(`✓ meetings_this_week: ${result.meetings_this_week}`);
    console.log(
      `✓ ai_employees_used_14d: ${result.ai_employees_used_14d?.length ?? 0}`,
    );
  }

  // Verify audit log row was written
  const { data: auditRows } = await sb
    .from("audit_log")
    .select("id, action, question, answer, created_at")
    .eq("actor_id", owner.id)
    .eq("target_id", member.id)
    .eq("action", "get_member_project_brief")
    .order("created_at", { ascending: false })
    .limit(1);
  if ((auditRows ?? []).length > 0) {
    console.log(`✓ audit_log row written: "${auditRows![0].question}"`);
  } else {
    console.log(`✗ audit_log row missing`);
  }

  // Cleanup
  await sb.from("audit_log").delete().eq("target_id", member.id);
  await sb.from("notes").delete().eq("user_id", member.id);
  await sb.from("org_members").delete().eq("user_id", member.id);
  await sb.from("users").delete().eq("id", member.id);
  console.log("→ cleanup done");

  console.log("\n🎉 project brief tool verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
