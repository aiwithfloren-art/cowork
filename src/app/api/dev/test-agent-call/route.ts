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

  // For multi-agent orchestration testing: force gpt-4o-mini when no
  // specific sub-agent is targeted (main router needs reasoning to
  // decide when to delegate vs answer directly — Flash Lite can't).
  const llm = await getLLMForAgent(
    userId,
    agentRecord ?? {
      llm_override_provider: "openrouter",
      llm_override_model: "openai/gpt-4o-mini",
    },
  );

  // For main-Sigap testing (no agent_name), build a minimal main prompt
  // that includes delegation context so we can exercise multi-agent flow.
  let system: string;
  if (agentRecord) {
    system = agentRecord.system_prompt;
  } else {
    const { data: userAgents } = await sb
      .from("custom_agents")
      .select("name, description")
      .eq("user_id", userId);
    const list = (userAgents ?? [])
      .map((a) => `- **${a.name}** — ${a.description ?? ""}`)
      .join("\n");
    system = `You are Sigap, the user's main AI Chief of Staff. You orchestrate work and can delegate to specialized agents when needed.

## Available specialized agents (use \`delegate_to_agent\` tool)
${list || "(none installed)"}

When the user's request matches one of these specialists' domains, call \`delegate_to_agent\` with the agent name + task. Pass the sub-agent's reply to the user with light synthesis. For multi-part requests, call delegate_to_agent multiple times.

Match user's language (ID/EN). Be concise.`;
  }

  const t0 = Date.now();

  // Auto-retry on Flash Lite failure modes:
  // - finish_reason="other" with 0 tokens (provider returned nothing)
  // - finish_reason="stop" but step_count<2 AND no tools called (model gave up)
  // Try up to 2 attempts. Transparent to caller.
  const generate = () =>
    generateText({
      model: llm.model,
      system,
      messages: [{ role: "user", content: body.message }],
      tools,
      stopWhen: stepCountIs(20),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

  let result = await generate();
  let attempts = 1;
  let isUnreliableFailure = (r: typeof result) => {
    if (r.finishReason === "other") return true;
    const calledCount = (r.steps ?? []).flatMap((s) => s.toolCalls ?? []).length;
    if (calledCount === 0 && (r.steps ?? []).length < 2 && !r.text) return true;
    return false;
  };
  while (isUnreliableFailure(result) && attempts < 2) {
    result = await generate();
    attempts++;
  }
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
    attempts,
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
