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
    .from("notifications")
    .select(
      "id, kind, title, body, link, read_at, created_at, actor_id, users:actor_id(name, email)",
    )
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(30);

  const notifications = (data ?? []).map((n) => {
    const u = n.users as { name?: string; email?: string } | null;
    return {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: Boolean(n.read_at),
      from: u?.name || u?.email || "system",
      created_at: n.created_at,
    };
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  return NextResponse.json({ notifications, unreadCount });
}
