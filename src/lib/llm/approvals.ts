import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Approval gate for sensitive tool calls. Org owner/manager configures which
 * tools require approval via organizations.require_approval_for (text[]).
 * When a gated tool fires:
 *   1. A pending_approvals row is inserted.
 *   2. In-app notifications go out to owners + managers of the requester's
 *      primary org.
 *   3. The tool returns a "waiting_for_approval" sentinel so the LLM tells
 *      the user the request is pending. A separate /api/approvals/[id]/execute
 *      endpoint runs the actual tool once approved.
 *
 * This keeps tool.execute() synchronous and fast — we don't block the LLM
 * turn waiting for a human. The UX is: "Request sent for approval" now,
 * "Email sent to Budi ✅" after manager taps Allow.
 */

const DEFAULT_TIMEOUT_MINUTES = 60 * 24; // 24h — auto-timeout denial after

export type ApprovalContext = {
  userId: string;
  agentId?: string | null;
  toolName: string;
  toolArgs: Record<string, unknown>;
  summary: string; // human-readable "Kirim email ke budi@acme.com — subject: ..."
};

export type ApprovalCheck =
  | { gated: false }
  | { gated: true; approvalId: string; summary: string };

/**
 * Decide whether a tool call is gated for the caller's org. Returns enough
 * info for the caller to either proceed normally or short-circuit with a
 * "waiting for approval" reply.
 */
export async function checkApproval(
  ctx: ApprovalContext,
): Promise<ApprovalCheck> {
  const sb = supabaseAdmin();

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  const orgId = (membership?.org_id as string | null) ?? null;

  if (!orgId) return { gated: false };

  const { data: org } = await sb
    .from("organizations")
    .select("require_approval_for")
    .eq("id", orgId)
    .maybeSingle();
  const gatedTools = (org?.require_approval_for as string[] | null) ?? [];
  if (!gatedTools.includes(ctx.toolName)) return { gated: false };

  const expiresAt = new Date(
    Date.now() + DEFAULT_TIMEOUT_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: approval, error } = await sb
    .from("pending_approvals")
    .insert({
      requester_id: ctx.userId,
      org_id: orgId,
      agent_id: ctx.agentId ?? null,
      tool_name: ctx.toolName,
      tool_args: ctx.toolArgs,
      summary: ctx.summary.slice(0, 500),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !approval) {
    // If we can't create the approval row, fail open rather than block the
    // user — log it, but let the tool proceed. Alternative (fail closed) is
    // too brittle for single-point DB hiccups.
    console.error("[approvals] failed to create row:", error);
    return { gated: false };
  }

  // Notify approvers (owners + managers of this org)
  const { data: approvers } = await sb
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ["owner", "manager"]);

  const { data: requesterRow } = await sb
    .from("users")
    .select("name, email")
    .eq("id", ctx.userId)
    .maybeSingle();
  const requesterName =
    (requesterRow?.name as string | null) ??
    (requesterRow?.email as string | null) ??
    "Someone";

  const notifRows = (approvers ?? []).map((a) => ({
    user_id: a.user_id as string,
    actor_id: ctx.userId,
    kind: "approval_request",
    title: `${requesterName} minta approval`,
    body: ctx.summary.slice(0, 280),
    link: `/approvals/${approval.id}`,
  }));
  if (notifRows.length > 0) {
    await sb.from("notifications").insert(notifRows);
  }

  return { gated: true, approvalId: approval.id as string, summary: ctx.summary };
}

/**
 * Build the standard "pending approval" tool result so every gated tool
 * returns a consistent shape the LLM can reliably report back.
 */
export function pendingApprovalResult(
  approvalId: string,
  humanAction: string,
): {
  ok: false;
  pending_approval: true;
  approval_id: string;
  message: string;
  note: string;
} {
  return {
    ok: false,
    pending_approval: true,
    approval_id: approvalId,
    message: `Permintaan "${humanAction}" nunggu approval owner/manager. Mereka bakal dapet notif.`,
    note: `Do NOT claim the action was executed. Tell the user the exact message above — their request is waiting for human approval at /approvals/${approvalId}.`,
  };
}
