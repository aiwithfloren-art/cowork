import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, content } = (await req.json()) as { id: string; content: string };
  if (!id || !content?.trim()) {
    return NextResponse.json({ error: "id and content required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("notes")
    .update({ content: content.trim() })
    .eq("user_id", uid)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
