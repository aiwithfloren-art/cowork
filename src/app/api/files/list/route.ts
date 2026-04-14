import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("user_files")
    .select("id, file_id, file_name, mime_type, added_at")
    .eq("user_id", uid)
    .order("added_at", { ascending: false });

  return NextResponse.json({ files: data ?? [] });
}
