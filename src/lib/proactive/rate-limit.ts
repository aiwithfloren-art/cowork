/**
 * Rate limiter for Brave Search calls in proactive cron path.
 *
 * Brave free tier = 2,000 queries/month per key. We cap at:
 *   - Per-org: 50 searches/day (resets at UTC midnight)
 *
 * Per-user soft warning (10/day) is logged only — not enforced — so a
 * single user can't accidentally lock out the whole org. Hard cap is at
 * the org level.
 *
 * Storage: two columns on `organizations` (added by M4 migration):
 *   - brave_search_count int default 0
 *   - brave_search_reset_at timestamptz default now()
 *
 * No-org users: skipped (proactive mode requires being in an org for now).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export const ORG_DAILY_BRAVE_LIMIT = 50;

export type RateLimitOutcome =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "no_org" | "limit_reached"; remaining: 0 };

/**
 * Atomically check-and-increment the org's daily Brave counter. Returns
 * whether the call is allowed. Always call BEFORE hitting Brave.
 *
 * Resets the counter if the stored reset_at is in the past (>= 24h ago,
 * UTC-day boundary).
 */
export async function tryConsumeBraveQuota(
  orgId: string | null,
): Promise<RateLimitOutcome> {
  if (!orgId) {
    return { allowed: false, reason: "no_org", remaining: 0 };
  }

  const sb = supabaseAdmin();

  const { data: org, error } = await sb
    .from("organizations")
    .select("brave_search_count, brave_search_reset_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!org) return { allowed: false, reason: "no_org", remaining: 0 };

  const now = new Date();
  const resetAt = org.brave_search_reset_at
    ? new Date(org.brave_search_reset_at as string)
    : new Date(0);
  const shouldReset = isPastUtcMidnight(resetAt, now);

  let currentCount = (org.brave_search_count as number | null) ?? 0;
  if (shouldReset) currentCount = 0;

  if (currentCount >= ORG_DAILY_BRAVE_LIMIT) {
    return { allowed: false, reason: "limit_reached", remaining: 0 };
  }

  const newCount = currentCount + 1;
  const newResetAt = shouldReset ? nextUtcMidnight(now) : org.brave_search_reset_at;

  const { error: updateErr } = await sb
    .from("organizations")
    .update({
      brave_search_count: newCount,
      brave_search_reset_at: newResetAt,
    })
    .eq("id", orgId);
  if (updateErr) throw updateErr;

  return {
    allowed: true,
    remaining: Math.max(0, ORG_DAILY_BRAVE_LIMIT - newCount),
  };
}

/**
 * Soft per-user check — logs warning if user's daily proactive runs > 10.
 * Doesn't block. Used to surface abuse patterns to admins later.
 */
export function logUserSoftWarn(userId: string, dailyRunCount: number): void {
  if (dailyRunCount >= 10) {
    console.warn(
      `[brave-rate-limit] user ${userId} has ${dailyRunCount} proactive runs today (soft cap 10)`,
    );
  }
}

function isPastUtcMidnight(stored: Date, now: Date): boolean {
  const storedUtcDay = Math.floor(stored.getTime() / 86_400_000);
  const nowUtcDay = Math.floor(now.getTime() / 86_400_000);
  return nowUtcDay > storedUtcDay;
}

function nextUtcMidnight(from: Date): string {
  const next = new Date(from);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
