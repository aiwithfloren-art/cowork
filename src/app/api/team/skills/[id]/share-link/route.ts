import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Mint (or return existing) share token for an AI employee template. Any
 * org member can mint a share link — the link recipient goes through
 * /install/<token> which handles org-join + agent-activation. Owner-level
 * permissioning for mint isn't needed because the template is already
 * intentionally published by an admin.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select("id, org_id, share_token")
    .eq("id", id)
    .maybeSingle();
  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Caller must be a member of the template's org to mint a link
  const { data: membership } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", tmpl.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  let token = (tmpl.share_token as string | null) ?? null;
  if (!token) {
    token = crypto.randomBytes(18).toString("base64url");
    const { error } = await sb
      .from("org_agent_templates")
      .update({ share_token: token })
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}
