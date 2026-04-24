import { supabaseAdmin } from "@/lib/supabase/admin";

const DAILY_LIMIT = parseInt(process.env.DAILY_MESSAGE_LIMIT || "30", 10);
const HOURLY_LIMIT = parseInt(process.env.HOURLY_MESSAGE_LIMIT || "10", 10);
const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD || "10");

export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      reason: "daily" | "hourly" | "budget";
      message: string;
      resetsAt?: string;
    };

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const sb = supabaseAdmin();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Resolve the effective daily cap: org policy (if set) takes precedence
  // over the platform default. Org owners set this via /team/admin to
  // enforce per-seat governance separate from the free-tier budget.
  const orgDailyCap = await loadOrgDailyQuota(userId);
  const effectiveDailyLimit = orgDailyCap ?? DAILY_LIMIT;

  const [{ count: dayCount }, { count: hourCount }, { data: spend }] = await Promise.all([
    sb
      .from("usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayAgo),
    sb
      .from("usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo),
    sb
      .from("usage_log")
      .select("cost_usd")
      .gte("created_at", monthStart),
  ]);

  if ((dayCount ?? 0) >= effectiveDailyLimit) {
    const reset = new Date(now);
    reset.setDate(reset.getDate() + 1);
    reset.setHours(0, 0, 0, 0);
    const byOrg = orgDailyCap != null;
    return {
      ok: false,
      reason: "daily",
      message: byOrg
        ? `Daily limit reached (${effectiveDailyLimit} messages/day — set by your org admin). Ask your admin to raise the cap, or try again tomorrow.`
        : `Daily limit reached (${effectiveDailyLimit} messages/day on free tier). Try again tomorrow.`,
      resetsAt: reset.toISOString(),
    };
  }

  if ((hourCount ?? 0) >= HOURLY_LIMIT) {
    const reset = new Date(now.getTime() + 60 * 60 * 1000);
    return {
      ok: false,
      reason: "hourly",
      message: `Hourly limit reached (${HOURLY_LIMIT} messages/hour). Take a break and try again soon.`,
      resetsAt: reset.toISOString(),
    };
  }

  const totalSpend = (spend ?? []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  if (totalSpend >= MONTHLY_BUDGET) {
    return {
      ok: false,
      reason: "budget",
      message: `Sigap's monthly free-tier budget is exhausted. Try again next month.`,
    };
  }

  return { ok: true };
}

export async function logUsage(
  userId: string,
  tokensIn: number,
  tokensOut: number,
  cost: number,
  model: string,
) {
  const sb = supabaseAdmin();
  await sb.from("usage_log").insert({
    user_id: userId,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: cost,
    model,
  });
}

/**
 * Returns the org-level daily message cap for this user's primary org, or
 * null if no cap is set (falls back to platform default). 0 means "freeze
 * usage" — honored as a hard cap of 0 so no messages get through.
 */
async function loadOrgDailyQuota(userId: string): Promise<number | null> {
  try {
    const sb = supabaseAdmin();
    const { data: membership } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!membership?.org_id) return null;
    const { data: org } = await sb
      .from("organizations")
      .select("daily_quota_per_member")
      .eq("id", membership.org_id)
      .maybeSingle();
    const cap = org?.daily_quota_per_member;
    return typeof cap === "number" ? cap : null;
  } catch (e) {
    console.error(
      "[ratelimit] org quota lookup failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
