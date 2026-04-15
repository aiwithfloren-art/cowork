import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org_id, user_id } = (await req.json()) as {
    org_id: string;
    user_id: string;
  };
  if (!org_id || !user_id) {
    return NextResponse.json({ error: "org_id and user_id required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: me } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (me?.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can remove members" },
      { status: 403 },
    );
  }

  if (user_id === uid) {
    return NextResponse.json(
      { error: "Owner cannot remove themselves. Delete the org instead." },
      { status: 400 },
    );
  }

  const { error } = await sb
    .from("org_members")
    .delete()
    .eq("org_id", org_id)
    .eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
