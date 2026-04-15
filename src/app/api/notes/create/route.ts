import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, type } = (await req.json()) as {
    content: string;
    type?: string;
  };
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const validTypes = ["general", "user", "feedback", "project", "reference"];
  const noteType = type && validTypes.includes(type) ? type : "general";

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notes")
    .insert({ user_id: uid, content: content.trim(), type: noteType })
    .select("id, content, type, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
