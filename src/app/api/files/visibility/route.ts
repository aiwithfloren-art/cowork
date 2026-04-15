import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED = new Set(["private", "team", "org"]);

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { file_id, visibility } = (await req.json()) as {
    file_id: string;
    visibility: string;
  };
  if (!file_id || !ALLOWED.has(visibility)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("user_files")
    .update({ visibility })
    .eq("user_id", uid)
    .eq("file_id", file_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
