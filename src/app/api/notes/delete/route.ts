import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = supabaseAdmin();
  await sb.from("notes").delete().eq("user_id", uid).eq("id", id);
  return NextResponse.json({ ok: true });
}
