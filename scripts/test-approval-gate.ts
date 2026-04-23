/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { checkApproval, pendingApprovalResult } from "../src/lib/llm/approvals";

/**
 * Verify approval gating:
 *   1. Without gating configured, send_email would proceed (we don't call it).
 *   2. With send_email gated, checkApproval() inserts a pending row and
 *      returns { gated: true, approvalId }.
 *   3. Notification rows get inserted for owners/managers of the org.
 */
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
  if (!user) throw new Error("user missing");
  console.log(`user: ${user.email} (${user.id})`);

  const { data: member } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) throw new Error("no org membership");
  console.log(`org: ${member.org_id} role=${member.role}`);

  // Clean prior test rows
  await sb
    .from("pending_approvals")
    .delete()
    .eq("requester_id", user.id)
    .like("summary", "%TEST-GATE%");

  // Flip org to require approval for send_email
  await sb
    .from("organizations")
    .update({ require_approval_for: ["send_email"] })
    .eq("id", member.org_id);
  console.log("✓ org require_approval_for = [send_email]");

  // Run the gate
  const r = await checkApproval({
    userId: user.id,
    toolName: "send_email",
    toolArgs: { to: "test@example.com", subject: "TEST-GATE hi", body: "hi" },
    summary: "TEST-GATE Kirim email ke test@example.com",
  });
  console.log("gate result:", r);
  if (!r.gated) throw new Error("expected gated=true");

  const pendingResult = pendingApprovalResult(r.approvalId, "kirim email ke test@example.com");
  console.log("\ntool return to LLM:\n", JSON.stringify(pendingResult, null, 2));

  // Verify row
  const { data: row } = await sb
    .from("pending_approvals")
    .select("id, status, summary, tool_name, expires_at")
    .eq("id", r.approvalId)
    .maybeSingle();
  console.log("\nrow in DB:", row);
  if (row?.status !== "pending") throw new Error("expected pending");

  // Verify notifications
  const { count: notifCount } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("kind", "approval_request")
    .ilike("body", "%TEST-GATE%");
  console.log(`✓ ${notifCount} notif(s) inserted for approvers`);

  // Cleanup — revert require_approval_for + delete test row
  await sb
    .from("organizations")
    .update({ require_approval_for: [] })
    .eq("id", member.org_id);
  await sb.from("pending_approvals").delete().eq("id", r.approvalId);
  await sb.from("notifications").delete().ilike("body", "%TEST-GATE%");
  console.log("\n(cleaned up)");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
