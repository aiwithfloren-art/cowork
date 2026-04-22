import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Unpublish (delete) a skill template. Only the original publisher or an
 * owner/manager of the org can remove a template. Already-installed copies
 * in members' custom_agents are unaffected (install is a fork).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: template } = await sb
    .from("org_agent_templates")
    .select("org_id, published_by")
    .eq("id", id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { data: membership } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", template.org_id)
    .eq("user_id", uid)
    .maybeSingle();

  const isPublisher = template.published_by === uid;
  const isAdmin =
    membership?.role === "owner" || membership?.role === "manager";
  if (!isPublisher && !isAdmin) {
    return NextResponse.json(
      { error: "Only the publisher, owner, or manager can unpublish" },
      { status: 403 },
    );
  }

  const { error } = await sb
    .from("org_agent_templates")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
