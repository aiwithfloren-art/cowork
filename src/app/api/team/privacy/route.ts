import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org_id, share } = (await req.json()) as { org_id: string; share: boolean };
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("org_members")
    .update({ share_with_manager: Boolean(share) })
    .eq("org_id", org_id)
    .eq("user_id", uid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
