import { supabaseAdmin } from "@/lib/supabase/admin";

const DAILY_LIMIT = parseInt(process.env.DAILY_MESSAGE_LIMIT || "30", 10);
const HOURLY_LIMIT = parseInt(process.env.HOURLY_MESSAGE_LIMIT || "10", 10);
const MONTHLY_BUDGET = parseFloat(process.env.MONTHLY_BUDGET_USD || "10");

export type RateLimitResult =
  | { ok: true }
  | { ok: false; reason: "daily" | "hourly" | "budget"; message: string };

export async function checkRateLimit(userId: string, userHasOwnKey: boolean): Promise<RateLimitResult> {
  // Users with their own API key bypass our rate limits & budget
  if (userHasOwnKey) return { ok: true };

  const sb = supabaseAdmin();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

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

  if ((dayCount ?? 0) >= DAILY_LIMIT) {
    return {
      ok: false,
      reason: "daily",
      message: `Daily limit reached (${DAILY_LIMIT} messages/day on free tier). Add your own Groq API key in Settings for unlimited usage, or try again tomorrow.`,
    };
  }

  if ((hourCount ?? 0) >= HOURLY_LIMIT) {
    return {
      ok: false,
      reason: "hourly",
      message: `Hourly limit reached (${HOURLY_LIMIT} messages/hour). Take a break and try again in a bit, or add your own key in Settings.`,
    };
  }

  const totalSpend = (spend ?? []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  if (totalSpend >= MONTHLY_BUDGET) {
    return {
      ok: false,
      reason: "budget",
      message: `Cowork's monthly free-tier budget is exhausted. Add your own Groq API key in Settings to continue (30 seconds at console.groq.com).`,
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
