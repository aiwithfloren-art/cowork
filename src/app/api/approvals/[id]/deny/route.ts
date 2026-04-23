import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
    .select("id, org_id, requester_id, status, summary")
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
      { error: "Only owner/manager can deny" },
      { status: 403 },
    );
  }

  await sb
    .from("pending_approvals")
    .update({
      status: "denied",
      decided_by: uid,
      decided_at: new Date().toISOString(),
      result_summary: "Denied by approver.",
    })
    .eq("id", id);

  await sb.from("notifications").insert({
    user_id: approval.requester_id,
    actor_id: uid,
    kind: "approval_decided",
    title: "Approval denied",
    body: (approval.summary as string | null)?.slice(0, 280) ?? "Request denied",
    link: `/approvals`,
  });

  return NextResponse.json({ ok: true, status: "denied", result: "Denied." });
}
