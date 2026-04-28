/**
 * Sub-agent runner. Lets one agent (typically the main Sigap chat agent)
 * execute another installed agent's logic with a specific task and get the
 * final reply text back. Powers the `delegate_to_agent` tool used in
 * multi-agent orchestration.
 *
 * Cost guard: sub-agent calls add real LLM cost on top of the parent. We
 * cap step count and surface the cost back to caller for logging.
 *
 * Recursion guard: a sub-agent does NOT receive its own delegate tool.
 * It can only do its own thing — replying with text that the parent then
 * synthesizes. This keeps the call graph 1-deep.
 */

import { generateText, stepCountIs } from "ai";
import { getLLMForAgent, estimateCost } from "@/lib/llm/providers";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";
import { validateAssistantResponse } from "@/lib/llm/validate-response";

export type SubAgentResult = {
  ok: boolean;
  agent_name: string;
  reply: string;
  tools_called: string[];
  cost_usd: number;
  error?: string;
};

/**
 * Execute a sub-agent (by name) with a given task message. Returns the
 * sub-agent's final reply text plus metadata. Used by `delegate_to_agent`
 * tool.
 */
export async function runSubAgent(args: {
  userId: string;
  agentName: string;
  task: string;
}): Promise<SubAgentResult> {
  const { userId, agentName, task } = args;

  try {
    const sb = supabaseAdmin();

    // Resolve sub-agent record from custom_agents.
    const { data } = await sb
      .from("custom_agents")
      .select("name, system_prompt, enabled_tools, llm_override_provider, llm_override_model")
      .eq("user_id", userId)
      .eq("name", agentName)
      .maybeSingle();
    if (!data) {
      return {
        ok: false,
        agent_name: agentName,
        reply: "",
        tools_called: [],
        cost_usd: 0,
        error: `Agent '${agentName}' not installed for this user. Available agents must be installed first via Skill Hub.`,
      };
    }
    const agentRecord = data as unknown as {
      name: string;
      system_prompt: string;
      enabled_tools: string[];
      llm_override_provider: string | null;
      llm_override_model: string | null;
    };

    // Build tools for sub-agent — but EXCLUDE delegate_to_agent so a
    // sub-agent can't recursively delegate. This keeps the call graph
    // exactly 1-deep (main → sub, never main → sub → sub).
    const allTools = await buildToolsForUser(userId, { name: agentRecord.name });
    const tools = Object.fromEntries(
      Object.entries(allTools).filter(
        ([k]) =>
          (agentRecord.enabled_tools ?? []).includes(k) && k !== "delegate_to_agent",
      ),
    );

    const llm = await getLLMForAgent(userId, agentRecord);

    const result = await generateText({
      model: llm.model,
      system: agentRecord.system_prompt,
      messages: [{ role: "user", content: task }],
      tools,
      stopWhen: stepCountIs(20),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

    const toolsCalled = (result.steps ?? [])
      .flatMap((s: { toolCalls?: Array<{ toolName?: string }> }) => s.toolCalls ?? [])
      .map((tc) => tc.toolName ?? "")
      .filter(Boolean);

    const rawText = result.text ?? "";
    const validated = validateAssistantResponse({
      text: rawText,
      steps: result.steps as Parameters<typeof validateAssistantResponse>[0]["steps"],
    });

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    const cost = estimateCost(llm.provider, tokensIn, tokensOut);

    return {
      ok: true,
      agent_name: agentRecord.name,
      reply: validated.text || "(sub-agent returned empty response)",
      tools_called: toolsCalled,
      cost_usd: cost,
    };
  } catch (e) {
    return {
      ok: false,
      agent_name: agentName,
      reply: "",
      tools_called: [],
      cost_usd: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
