/**
 * DEV-ONLY test endpoint. Lets us drive an agent from outside the normal
 * session-based UI so we can validate behavior on production without
 * forging a Google OAuth login.
 *
 * Auth: Bearer CRON_SECRET (same secret cron uses). Not exposed in the
 * UI. Treats whatever user_id is passed as the actor — caller is
 * responsible for picking a real user.
 *
 * Returns: full text + tools_called + steps summary + validation result
 * so we can see exactly what the model did, what tools fired, and
 * whether the hallucination guard caught anything.
 */

import { NextResponse } from "next/server";
import { generateText, stepCountIs } from "ai";
import { getLLMForAgent, estimateCost } from "@/lib/llm/providers";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";
import { validateAssistantResponse } from "@/lib/llm/validate-response";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  user_id?: string;
  agent_name?: string;
  message: string;
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body?.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Resolve user — accept explicit user_id or grab first user in DB.
  let userId = body.user_id;
  if (!userId) {
    const { data } = await sb.from("users").select("id").limit(1).maybeSingle();
    userId = data?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "No users in DB" }, { status: 500 });
  }

  type AgentRecord = {
    id: string;
    name: string;
    system_prompt: string;
    enabled_tools: string[];
    llm_override_provider: string | null;
    llm_override_model: string | null;
  };

  // Resolve agent record by name from custom_agents (preserves per-agent
  // model override + enabled_tools just like /api/chat).
  let agentRecord: AgentRecord | null = null;
  if (body.agent_name) {
    const { data } = await sb
      .from("custom_agents")
      .select("id, name, system_prompt, enabled_tools, llm_override_provider, llm_override_model")
      .eq("user_id", userId)
      .eq("name", body.agent_name)
      .maybeSingle();
    if (!data) {
      return NextResponse.json(
        { error: `Agent '${body.agent_name}' not found for user ${userId}` },
        { status: 404 },
      );
    }
    agentRecord = data as unknown as AgentRecord;
  }

  const allTools = await buildToolsForUser(
    userId,
    agentRecord ? { name: agentRecord.name } : undefined,
  );
  const tools = agentRecord
    ? Object.fromEntries(
        Object.entries(allTools).filter(([k]) =>
          (agentRecord!.enabled_tools ?? []).includes(k),
        ),
      )
    : allTools;

  const llm = await getLLMForAgent(userId, agentRecord);
  const system = agentRecord?.system_prompt ?? "You are a helpful assistant.";

  const t0 = Date.now();
  const result = await generateText({
    model: llm.model,
    system,
    messages: [{ role: "user", content: body.message }],
    tools,
    stopWhen: stepCountIs(20),
    prepareStep: async ({ messages }) => ({
      messages: stripReasoningFromMessages(messages),
    }),
  });
  const elapsedMs = Date.now() - t0;

  const toolsCalled = (result.steps ?? [])
    .flatMap((s: { toolCalls?: Array<{ toolName?: string }> }) => s.toolCalls ?? [])
    .map((tc) => tc.toolName);

  const rawText = result.text ?? "";
  const validation = validateAssistantResponse({
    text: rawText,
    steps: result.steps as Parameters<typeof validateAssistantResponse>[0]["steps"],
  });

  const tokensIn = result.usage?.inputTokens ?? 0;
  const tokensOut = result.usage?.outputTokens ?? 0;
  const cost = estimateCost(llm.provider, tokensIn, tokensOut);

  // Extract tool call inputs + results so we can see WHAT failed.
  type StepShape = {
    toolCalls?: Array<{ toolName?: string; input?: unknown; args?: unknown }>;
    toolResults?: Array<{ toolName?: string; result?: unknown; output?: unknown }>;
    content?: Array<{ type?: string; toolName?: string; input?: unknown; output?: unknown; result?: unknown }>;
  };
  const tool_log: Array<{ tool: string; input?: unknown; result?: unknown }> = [];
  for (const s of (result.steps ?? []) as StepShape[]) {
    const calls = s.toolCalls ?? [];
    const results = s.toolResults ?? [];
    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i];
      const tr = results[i] ?? {};
      tool_log.push({
        tool: tc?.toolName ?? "?",
        input: tc?.input ?? tc?.args,
        result: tr?.result ?? tr?.output,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    agent_name: agentRecord?.name ?? null,
    model: llm.modelId,
    elapsed_ms: elapsedMs,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: cost,
    tools_called: toolsCalled,
    tool_log,
    raw_text: rawText,
    final_text: validation.text,
    hallucination_caught: validation.changed,
    hallucinated_urls: validation.hallucinated_urls,
    validation_notes: validation.notes,
    finish_reason: result.finishReason,
    step_count: result.steps?.length ?? 0,
  });
}
