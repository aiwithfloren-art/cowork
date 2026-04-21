import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * PATCH /api/agents/digests/[id]
 * Body: { status: "approved" | "dismissed" }
 * Used by the digest UI to mark a digest as handled.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { status?: string };
  if (!body.status || !["approved", "dismissed"].includes(body.status)) {
    return NextResponse.json(
      { error: "status must be 'approved' or 'dismissed'" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("agent_digests")
    .update({ status: body.status })
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
