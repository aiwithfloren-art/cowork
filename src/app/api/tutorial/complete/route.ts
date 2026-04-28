import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  await sb.from("user_settings").upsert({ user_id: userId, tutorial_done: true });
  return NextResponse.json({ ok: true });
}

// Replay the tutorial on demand — flips tutorial_done back to false so
// the next page load shows the modal again. Used by 'Show tutorial again'
// button in the dashboard nav.
export async function DELETE() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  await sb.from("user_settings").upsert({ user_id: userId, tutorial_done: false });
  return NextResponse.json({ ok: true });
}
