import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", uid)
    .maybeSingle();
  const orgId = membership?.org_id ?? null;

  const { data: privateNotes } = await sb
    .from("notes")
    .select("id, content, type, visibility, created_at")
    .eq("user_id", uid)
    .eq("visibility", "private")
    .order("created_at", { ascending: false })
    .limit(200);

  let teamNotes: Array<{
    id: string;
    content: string;
    type: string;
    visibility: string;
    created_at: string;
    author: string;
  }> = [];
  if (orgId) {
    const { data } = await sb
      .from("notes")
      .select(
        "id, content, type, visibility, created_at, user_id, users:user_id(name, email)",
      )
      .eq("org_id", orgId)
      .eq("visibility", "team")
      .order("created_at", { ascending: false })
      .limit(200);
    teamNotes = (data ?? []).map((n) => {
      const u = n.users as { name?: string; email?: string } | null;
      return {
        id: n.id,
        content: n.content,
        type: n.type,
        visibility: n.visibility,
        created_at: n.created_at,
        author: u?.name || u?.email || "teammate",
      };
    });
  }

  const combined = [
    ...(privateNotes ?? []).map((n) => ({ ...n, author: "you" })),
    ...teamNotes,
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ notes: combined });
}
