import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agents/runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agents/[slug]/run
 * Manually trigger a digest run for this agent. Returns the digest
 * summary. Used by "Run now" button in the UI and by the cron runner.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data: agent } = await sb
    .from("custom_agents")
    .select("id, last_run_at")
    .eq("user_id", uid)
    .eq("slug", slug)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Prevent manual spam: at most one run per minute per agent.
  const MIN_GAP_MS = 60 * 1000;
  if (agent.last_run_at) {
    const age = Date.now() - new Date(agent.last_run_at).getTime();
    if (age < MIN_GAP_MS) {
      const remaining = Math.ceil((MIN_GAP_MS - age) / 1000);
      return NextResponse.json(
        {
          error: `Baru aja dijalanin. Tunggu ${remaining}s sebelum run lagi.`,
          retry_after_sec: remaining,
        },
        { status: 429 },
      );
    }
  }

  const result = await runAgent(agent.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    digestId: result.digestId,
    summary: result.summary,
  });
}
