import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateProactiveDraft,
  nowInJakarta,
  PROACTIVE_AGENT_NAME,
  userQualifiesNow,
} from "@/lib/proactive/content-creator";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron — runs every hour at :00 UTC. Finds Content Creator users
 * whose preferred_hour matches the current Jakarta hour AND whose
 * frequency rule fires today, then generates one proactive draft per
 * qualified user.
 *
 * Schedule: "0 * * * *" in vercel.json.
 *
 * Auth: Bearer CRON_SECRET. Vercel's cron infra includes this header
 * automatically.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const jakarta = nowInJakarta();

  const { data: configs, error } = await sb
    .from("agent_user_config")
    .select("user_id, config")
    .eq("agent_name", PROACTIVE_AGENT_NAME)
    .eq("onboarding_completed", true);

  if (error) {
    console.error("[content-creator-proactive] config fetch failed:", error);
    return NextResponse.json({ error: "config_fetch_failed" }, { status: 500 });
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json({ ok: true, jakarta_hour: jakarta.hour, qualified: 0 });
  }

  const qualified: Array<{ user_id: string }> = [];
  for (const row of configs) {
    const cfg = (row.config as Record<string, unknown> | null) ?? {};
    const preferredHourRaw = cfg.preferred_hour;
    const preferredHour =
      typeof preferredHourRaw === "number"
        ? preferredHourRaw
        : typeof preferredHourRaw === "string"
        ? Number.parseInt(preferredHourRaw, 10)
        : undefined;

    if (
      userQualifiesNow({
        proactiveMode: typeof cfg.proactive_mode === "string" ? cfg.proactive_mode : undefined,
        frequency: typeof cfg.frequency === "string" ? cfg.frequency : undefined,
        preferredHour: Number.isFinite(preferredHour) ? preferredHour : undefined,
        nowJakarta: jakarta,
      })
    ) {
      qualified.push({ user_id: row.user_id as string });
    }
  }

  if (qualified.length === 0) {
    return NextResponse.json({
      ok: true,
      jakarta_hour: jakarta.hour,
      day_of_week: jakarta.dayOfWeek,
      qualified: 0,
    });
  }

  const orgIdByUser = await loadPrimaryOrgIds(qualified.map((q) => q.user_id));

  const results: Array<Record<string, unknown>> = [];
  for (const u of qualified) {
    const result = await generateProactiveDraft({
      userId: u.user_id,
      orgId: orgIdByUser.get(u.user_id) ?? null,
    });
    results.push({
      user_id: result.user_id,
      ok: result.ok,
      topic: result.topic,
      search_status: result.search_status,
      note_id: result.note_id,
      error: result.error,
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    jakarta_hour: jakarta.hour,
    day_of_week: jakarta.dayOfWeek,
    qualified: qualified.length,
    succeeded: okCount,
    failed: qualified.length - okCount,
    results,
  });
}

async function loadPrimaryOrgIds(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("org_members")
    .select("user_id, org_id")
    .in("user_id", userIds);
  for (const uid of userIds) map.set(uid, null);
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (!map.get(uid)) {
      map.set(uid, (row.org_id as string) ?? null);
    }
  }
  return map;
}
