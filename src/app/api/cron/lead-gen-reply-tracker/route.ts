import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRepliesForUser } from "@/lib/leadgen/reply-tracker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: users } = await sb
    .from("lead_gen_sheets")
    .select("user_id")
    .order("user_id");

  const uniqueUsers = Array.from(new Set((users ?? []).map((r) => r.user_id as string)));

  const results: Record<string, unknown>[] = [];
  for (const userId of uniqueUsers) {
    try {
      const r = await checkRepliesForUser(userId);
      results.push({ user_id: userId.slice(0, 12), ...r });
    } catch (e) {
      results.push({
        user_id: userId.slice(0, 12),
        error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
      });
    }
  }

  return NextResponse.json({ ok: true, users_checked: uniqueUsers.length, results });
}
