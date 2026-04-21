import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron: runs every hour at :00. Finds custom_agents whose
 * schedule_cron matches the current UTC minute and runs them.
 *
 * We support only common 5-field patterns — exact minute + hour + day
 * matching. For MVP, the UI exposes only a preset list (daily HH:MM,
 * weekdays HH:MM, etc.), so we don't need a full cron parser.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: agents } = await sb
    .from("custom_agents")
    .select("id, schedule_cron, last_run_at")
    .not("schedule_cron", "is", null);

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, ran: 0 });
  }

  const now = new Date();
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const a of agents) {
    if (!cronMatchesNow(a.schedule_cron as string, now)) continue;

    // Prevent double-runs: if last_run_at is within the last 55 min, skip.
    if (a.last_run_at) {
      const last = new Date(a.last_run_at).getTime();
      if (now.getTime() - last < 55 * 60 * 1000) {
        results.push({ id: a.id, ok: false, reason: "recent-run" });
        continue;
      }
    }

    const r = await runAgent(a.id);
    results.push({ id: a.id, ok: r.ok, reason: r.ok ? undefined : r.error });
  }

  return NextResponse.json({
    ok: true,
    ran: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    details: results,
  });
}

/**
 * Matches a 5-field cron (minute hour day month weekday) against `now`.
 * Supports:
 *   - "*" wildcard
 *   - literal numbers
 *   - comma-separated lists ("1,15,30")
 *   - ranges ("1-5")
 *   - step values ("0/15" -> 0,15,30,45)
 * All comparisons are done in UTC.
 */
export function cronMatchesNow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    fieldMatches(m, now.getUTCMinutes(), 0, 59) &&
    fieldMatches(h, now.getUTCHours(), 0, 23) &&
    fieldMatches(dom, now.getUTCDate(), 1, 31) &&
    fieldMatches(mon, now.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dow, now.getUTCDay(), 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(",").some((piece) => matchPiece(piece, value, min, max));
}

function matchPiece(piece: string, value: number, min: number, max: number): boolean {
  if (piece === "*") return true;
  const [range, stepStr] = piece.split("/");
  const step = stepStr ? parseInt(stepStr, 10) : 1;
  if (step <= 0) return false;

  let lo = min;
  let hi = max;
  if (range !== "*") {
    if (range.includes("-")) {
      const [a, b] = range.split("-").map((x) => parseInt(x, 10));
      if (isNaN(a) || isNaN(b)) return false;
      lo = a;
      hi = b;
    } else {
      const v = parseInt(range, 10);
      if (isNaN(v)) return false;
      if (stepStr) {
        lo = v;
        hi = max;
      } else {
        return v === value;
      }
    }
  }
  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}
