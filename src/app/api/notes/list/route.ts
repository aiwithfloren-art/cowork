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
    .from("notes")
    .select("id, content, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ notes: data ?? [] });
}
