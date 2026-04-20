import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Load all messages in the same "session window" around a pivot message.
// A session = chain of messages where each consecutive pair is within 30 minutes.
export async function GET(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pivotId = url.searchParams.get("pivot");
  const wantsLatest = url.searchParams.get("latest") === "true";
  if (!pivotId && !wantsLatest) {
    return NextResponse.json({ error: "pivot or latest=true required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Fetch all user messages ordered, then resolve the pivot (either the
  // explicitly requested id, or — when latest=true — the most recent one).
  const { data: all } = await sb
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(500);

  const msgs = all ?? [];
  if (msgs.length === 0) return NextResponse.json({ messages: [] });

  const pivotIdx = pivotId
    ? msgs.findIndex((m) => m.id === pivotId && m.role !== "tool")
    : msgs.length - 1;

  if (pivotId && pivotIdx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const GAP_MS = 30 * 60 * 1000;
  let start = pivotIdx;
  while (start > 0) {
    const prev = new Date(msgs[start - 1].created_at).getTime();
    const curr = new Date(msgs[start].created_at).getTime();
    if (curr - prev > GAP_MS) break;
    start--;
  }
  let end = pivotIdx;
  while (end < msgs.length - 1) {
    const curr = new Date(msgs[end].created_at).getTime();
    const next = new Date(msgs[end + 1].created_at).getTime();
    if (next - curr > GAP_MS) break;
    end++;
  }

  return NextResponse.json({
    messages: msgs
      .slice(start, end + 1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  });
}
