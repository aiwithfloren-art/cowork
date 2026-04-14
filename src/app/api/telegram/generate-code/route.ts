import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateLinkCode } from "@/lib/telegram/client";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Clean up any existing codes for this user
  await sb.from("telegram_link_codes").delete().eq("user_id", userId);
  const { error } = await sb
    .from("telegram_link_codes")
    .insert({ code, user_id: userId, expires_at: expiresAt });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code, expires_at: expiresAt });
}
