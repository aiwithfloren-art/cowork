import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Picked = { file_id: string; file_name: string; mime_type: string };

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { files: Picked[] };
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const rows = body.files.map((f) => ({
    user_id: uid,
    file_id: f.file_id,
    file_name: f.file_name,
    mime_type: f.mime_type,
  }));

  const { error } = await sb.from("user_files").upsert(rows, {
    onConflict: "user_id,file_id",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: rows.length });
}
