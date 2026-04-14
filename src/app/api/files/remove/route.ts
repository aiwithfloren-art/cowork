import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { file_id } = (await req.json()) as { file_id: string };
  if (!file_id) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  await sb.from("user_files").delete().eq("user_id", uid).eq("file_id", file_id);
  return NextResponse.json({ ok: true });
}
