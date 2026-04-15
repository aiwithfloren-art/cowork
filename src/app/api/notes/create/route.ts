import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, type, visibility } = (await req.json()) as {
    content: string;
    type?: string;
    visibility?: string;
  };
  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const validTypes = ["general", "user", "feedback", "project", "reference"];
  const noteType = type && validTypes.includes(type) ? type : "general";
  const vis = visibility === "team" ? "team" : "private";

  const sb = supabaseAdmin();

  let orgId: string | null = null;
  if (vis === "team") {
    const { data: m } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", uid)
      .maybeSingle();
    orgId = m?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json(
        { error: "Join an organization at /team first to save team notes." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await sb
    .from("notes")
    .insert({
      user_id: uid,
      content: content.trim(),
      type: noteType,
      visibility: vis,
      org_id: orgId,
    })
    .select("id, content, type, visibility, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
