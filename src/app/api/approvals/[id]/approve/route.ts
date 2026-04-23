import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/google/gmail";

export const runtime = "nodejs";

/**
 * Approver taps "Approve & run" — we flip status to executed and run the
 * gated tool with the saved args. Only send_email is wired for now; the
 * rest fall back to marking approved without auto-executing, requiring
 * the requester to retry. That's intentionally cautious for MVP.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data: approval } = await sb
    .from("pending_approvals")
    .select("id, org_id, requester_id, tool_name, tool_args, status")
    .eq("id", id)
    .maybeSingle();
  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: `Already ${approval.status}` },
      { status: 409 },
    );
  }

  // Caller must be owner/manager of the approval's org.
  const { data: membership } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", uid)
    .eq("org_id", approval.org_id)
    .maybeSingle();
  const canDecide =
    membership?.role === "owner" || membership?.role === "manager";
  if (!canDecide) {
    return NextResponse.json(
      { error: "Only owner/manager can approve" },
      { status: 403 },
    );
  }

  const args = (approval.tool_args ?? {}) as Record<string, unknown>;
  let resultSummary = "Approved (manual execution required by requester).";
  let finalStatus: "executed" | "approved" | "failed" = "approved";

  try {
    if (approval.tool_name === "send_email") {
      const to = String(args.to ?? "");
      const subject = String(args.subject ?? "");
      const body = String(args.body ?? "");
      const cc = args.cc ? String(args.cc) : undefined;
      const bcc = args.bcc ? String(args.bcc) : undefined;
      const res = await sendEmail(approval.requester_id as string, {
        to,
        subject,
        body,
        cc,
        bcc,
      });
      resultSummary = `Email sent to ${to} (id: ${res.id}).`;
      finalStatus = "executed";
    } else {
      // assign_task_to_member, broadcast_to_team, etc — MVP path: mark approved
      // but require requester to re-issue in chat. Phase 2 will execute these
      // directly once we've proven send_email works reliably.
      resultSummary = `Approved. Minta requester (${approval.requester_id}) re-run di chat.`;
      finalStatus = "approved";
    }
  } catch (e) {
    finalStatus = "failed";
    resultSummary = `Failed: ${e instanceof Error ? e.message : "unknown"}`;
  }

  await sb
    .from("pending_approvals")
    .update({
      status: finalStatus,
      decided_by: uid,
      decided_at: new Date().toISOString(),
      result_summary: resultSummary,
    })
    .eq("id", id);

  // Notify requester of the decision.
  await sb.from("notifications").insert({
    user_id: approval.requester_id,
    actor_id: uid,
    kind: "approval_decided",
    title: `Approval ${finalStatus === "executed" ? "approved" : finalStatus}`,
    body: resultSummary.slice(0, 280),
    link: `/approvals`,
  });

  return NextResponse.json({ ok: true, status: finalStatus, result: resultSummary });
}
