import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Disconnect Google. Deletes the google_tokens row, which removes
 * Sigap's stored access. The user can then re-authorize by signing
 * in again. Note this revokes Gmail / Calendar / Drive / Tasks all
 * at once since they share one OAuth grant.
 */
export async function POST() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb.from("google_tokens").delete().eq("user_id", uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
