import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id?: string };
  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  if (id) {
    await sb
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .eq("user_id", uid);
  } else {
    await sb
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", uid)
      .is("read_at", null);
  }

  return NextResponse.json({ ok: true });
}
