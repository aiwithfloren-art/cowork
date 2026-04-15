import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: Request) {
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberId, orgId, question } = (await req.json()) as {
    memberId: string;
    orgId: string;
    question: string;
  };
  if (!memberId || !orgId || !question) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Verify viewer is manager in this org
  const { data: viewer } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (!viewer || (viewer.role !== "owner" && viewer.role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target shares data
  const { data: target } = await sb
    .from("org_members")
    .select("share_with_manager, users(name, email)")
    .eq("org_id", orgId)
    .eq("user_id", memberId)
    .maybeSingle();
  if (!target?.share_with_manager) {
    return NextResponse.json({ error: "Member has not opted in to sharing" }, { status: 403 });
  }

  // Rate-limit the viewer
  const { data: viewerSettings } = await sb
    .from("user_settings")
    .select("groq_key, model")
    .eq("user_id", viewerId)
    .maybeSingle();
  const rl = await checkRateLimit(viewerId, Boolean(viewerSettings?.groq_key));
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  // Gather target's data (server-side, no LLM access to raw tokens)
  let events, week, tasks;
  try {
    [events, week, tasks] = await Promise.all([
      getTodayEvents(memberId),
      getWeekEvents(memberId),
      listTasks(memberId),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch member data" },
      { status: 500 },
    );
  }

  const targetName =
    (target as unknown as { users: { name: string | null; email: string } | null }).users?.name ??
    "this member";

  const context = {
    name: targetName,
    today_events: events.map((e) => ({ title: e.title, start: e.start, end: e.end })),
    week_events: week.map((e) => ({ title: e.title, start: e.start })),
    open_tasks: tasks.map((t) => ({ title: t.title, due: t.due })),
    task_count: tasks.length,
    overdue_count: tasks.filter((t) => t.due && new Date(t.due) < new Date()).length,
  };

  const groq = getGroq(viewerSettings?.groq_key ?? undefined);
  const model = DEFAULT_MODEL;

  try {
    const result = await generateText({
      model: groq(model),
      system: `You are Sigap Manager Mode. A manager is asking about a team member. Answer using ONLY the structured data below. Be concise and factual. If data is insufficient, say so. Never invent meetings or tasks.`,
      prompt: `Manager question: "${question}"\n\nMember data (JSON):\n${JSON.stringify(context, null, 2)}`,
    });

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    if (!viewerSettings?.groq_key) {
      await logUsage(viewerId, tokensIn, tokensOut, estimateCost(tokensIn, tokensOut), model);
    }

    // Audit log — visible to the member
    await sb.from("audit_log").insert({
      org_id: orgId,
      actor_id: viewerId,
      target_id: memberId,
      action: "ask_ai_about_member",
      question,
      answer: result.text,
    });

    return NextResponse.json({ answer: result.text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "LLM failed" },
      { status: 500 },
    );
  }
}
