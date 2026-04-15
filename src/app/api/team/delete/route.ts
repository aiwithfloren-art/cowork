import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org_id } = (await req.json()) as { org_id: string };
  if (!org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: org } = await sb
    .from("organizations")
    .select("owner_id")
    .eq("id", org_id)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  if (org.owner_id !== uid) {
    return NextResponse.json({ error: "Only the owner can delete" }, { status: 403 });
  }

  // Cascades: org_members, org_invites, audit_log are all on delete cascade
  // Team notes get org_id set to null (on delete set null)
  const { error } = await sb.from("organizations").delete().eq("id", org_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
