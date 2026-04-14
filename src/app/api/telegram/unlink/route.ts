import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  await sb.from("telegram_links").delete().eq("user_id", userId);
  await sb.from("telegram_link_codes").delete().eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
