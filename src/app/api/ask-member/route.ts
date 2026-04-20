import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { buildMemberTools } from "@/lib/llm/member-tools";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";

export const runtime = "nodejs";
export const maxDuration = 60;

const MEMBER_SYSTEM_PROMPT = `You are Sigap Manager Mode. A manager is asking about a team member. You have tools to read the member's calendar, tasks, and files that the member has explicitly shared with their team.

RULES:
1. Always call tools to get real data. Never invent events, tasks, or file contents.
2. Files the member marked 'private' are NEVER visible to you — only list_member_files will show shared files.
3. Be concise, factual, and helpful. Use bullet points.
4. When asked about a member's workload, call get_member_today_schedule + get_member_week_schedule + list_member_tasks, then summarize.
5. When asked to read/summarize/explain a specific file, call read_member_file DIRECTLY (it fuzzy-matches by name).
6. Reply in the language the manager wrote in.
7. After calling tools, ALWAYS write a natural-language response to the manager based on the data.`;

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

  // Verify target is in the same org AND has opted in to sharing
  const { data: target } = await sb
    .from("org_members")
    .select("share_with_manager")
    .eq("org_id", orgId)
    .eq("user_id", memberId)
    .maybeSingle();
  if (!target?.share_with_manager) {
    return NextResponse.json(
      { error: "This member has not opted in to sharing with their manager." },
      { status: 403 },
    );
  }

  // Look up target name for context
  const { data: targetUser } = await sb
    .from("users")
    .select("name, email")
    .eq("id", memberId)
    .maybeSingle();
  const targetName = targetUser?.name ?? targetUser?.email ?? "this team member";

  // Rate-limit the viewer
  const { data: viewerSettings } = await sb
    .from("user_settings")
    .select("groq_key")
    .eq("user_id", viewerId)
    .maybeSingle();
  const rl = await checkRateLimit(viewerId, Boolean(viewerSettings?.groq_key));
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const groq = getGroq(viewerSettings?.groq_key ?? undefined);
  const model = DEFAULT_MODEL;
  const tools = buildMemberTools({ viewerId, targetId: memberId, orgId });

  try {
    const result = await generateText({
      model: groq(model),
      system: MEMBER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `The team member you are answering about is: ${targetName}.\n\nManager's question: "${question}"`,
        },
      ],
      tools,
      stopWhen: stepCountIs(10),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

    const text = result.text || "(no response — try rephrasing)";

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    if (!viewerSettings?.groq_key) {
      await logUsage(viewerId, tokensIn, tokensOut, estimateCost(tokensIn, tokensOut), model);
    }

    // Audit log — general query record (read_member_file also logs individually)
    await sb.from("audit_log").insert({
      org_id: orgId,
      actor_id: viewerId,
      target_id: memberId,
      action: "ask_ai_about_member",
      question,
      answer: text,
    });

    return NextResponse.json({ answer: text });
  } catch (e) {
    console.error("ask-member error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "LLM failed" },
      { status: 500 },
    );
  }
}
