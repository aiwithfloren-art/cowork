import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * LLM provider abstraction. Pick the provider + model based on (in order):
 *   1. Platform default — OpenRouter + GPT-4o-mini via OPENROUTER_API_KEY.
 *      This wins over org-level policy so every user is on the same
 *      battle-tested function-calling stack; teams can still opt into BYO
 *      keys by setting organizations.llm_provider + llm_api_key.
 *   2. Org-level policy: organizations.llm_provider + llm_model + llm_api_key
 *      (org admin explicitly opted into a BYO provider — OpenAI direct,
 *      Anthropic, or any OpenRouter model).
 *   3. Fail closed — if no OpenRouter key and no org policy, throw. We no
 *      longer ship a zero-config fallback; deployments must set
 *      OPENROUTER_API_KEY.
 */

export type LLMProvider = "openai" | "anthropic" | "openrouter";

export const SUPPORTED_PROVIDERS: LLMProvider[] = [
  "openai",
  "anthropic",
  "openrouter",
];

// Sensible defaults per provider — model IDs that support tool-calling well.
// OpenRouter default is Gemini 2.5 Flash Lite: $0.10/$0.40 per 1M tokens.
// Cheapest reliable option for Sigap's tool-calling-heavy workload (55+
// tool definitions). Same Google function-calling stack as Flash full,
// just with a smaller cheaper model. ~33% cheaper than gpt-4o-mini.
//
// Why not gpt-oss-120b ($0.039/$0.19, even cheaper)? BFCL tool-calling
// score 67% — fails 1/3 of multi-tool turns. That's the model that
// caused Amanda's original 504 incident. Don't go back there.
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "google/gemini-2.5-flash-lite",
};

// Very rough $/1M tokens for usage estimation. Orgs on BYO providers pay
// via their own key so platform billing only tracks OpenRouter spend.
const COST_TABLE: Record<LLMProvider, { in: number; out: number }> = {
  openai: { in: 0.15, out: 0.6 },
  anthropic: { in: 3.0, out: 15.0 },
  openrouter: { in: 0.1, out: 0.4 },
};

export function estimateCost(
  provider: LLMProvider,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = COST_TABLE[provider] ?? COST_TABLE.openrouter;
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

/**
 * Resolve which provider + model + key to use for a given user, looking
 * up their org's policy. Returns the values needed to build a model
 * handle. Safe to call on every request — the DB hops are tiny lookups.
 */
export async function resolveLLMFor(userId: string): Promise<{
  provider: LLMProvider;
  model: string;
  apiKey: string | undefined;
}> {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model: DEFAULT_MODELS.openrouter,
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }

  const org = await loadPrimaryOrgPolicy(userId);
  if (org && isSupportedProvider(org.provider)) {
    return {
      provider: org.provider,
      model: org.model ?? DEFAULT_MODELS[org.provider],
      apiKey: org.apiKey ?? platformKeyFor(org.provider),
    };
  }

  throw new Error(
    "No LLM provider configured: set OPENROUTER_API_KEY, or configure an org BYO provider.",
  );
}

function isSupportedProvider(p: string | null | undefined): p is LLMProvider {
  return p === "openai" || p === "anthropic" || p === "openrouter";
}

function platformKeyFor(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
  }
}

async function loadPrimaryOrgPolicy(userId: string): Promise<{
  provider: string | null;
  model: string | null;
  apiKey: string | null;
} | null> {
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
      .select("llm_provider, llm_model, llm_api_key")
      .eq("id", membership.org_id)
      .maybeSingle();
    if (!org) return null;
    return {
      provider: (org.llm_provider as string | null) ?? null,
      model: (org.llm_model as string | null) ?? null,
      apiKey: (org.llm_api_key as string | null) ?? null,
    };
  } catch (e) {
    console.error(
      "[llm-providers] policy lookup failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/**
 * Build the actual AI-SDK model handle for a given provider + model + key.
 * Call sites pass the returned value straight into `generateText({model: ...})`.
 */
export function buildModel(
  provider: LLMProvider,
  modelId: string,
  apiKey: string | undefined,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: apiKey ?? "" })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: apiKey ?? "" })(modelId);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        apiKey: apiKey ?? "",
        baseURL: "https://openrouter.ai/api/v1",
      })(modelId);
  }
}

/**
 * Convenience wrapper — resolve policy + build model in one call. Returns
 * the model plus metadata callers need for usage logging (provider slug
 * for the cost table, model id for the audit record).
 */
export async function getLLMForUser(userId: string): Promise<{
  model: LanguageModel;
  provider: LLMProvider;
  modelId: string;
}> {
  const resolved = await resolveLLMFor(userId);
  return {
    model: buildModel(resolved.provider, resolved.model, resolved.apiKey),
    provider: resolved.provider,
    modelId: resolved.model,
  };
}

/**
 * Agent-aware LLM resolution. If the agent has per-agent override fields
 * set (e.g. Coder pinned to DeepSeek V3.2), use those; otherwise fall
 * through to the standard user/org resolution. Override keeps the API key
 * lookup — we need to find a key for the override provider, either from
 * env var or org.llm_api_key if the org was already on that provider.
 */
export async function getLLMForAgent(
  userId: string,
  agent: {
    llm_override_provider?: string | null;
    llm_override_model?: string | null;
  } | null | undefined,
): Promise<{ model: LanguageModel; provider: LLMProvider; modelId: string }> {
  if (
    agent?.llm_override_provider &&
    agent?.llm_override_model &&
    isSupportedProvider(agent.llm_override_provider)
  ) {
    const overrideProvider = agent.llm_override_provider;
    const overrideModel = agent.llm_override_model;

    // Prefer platform env var key for the override provider. Falls back to
    // the org's stored llm_api_key ONLY if the org happens to use the same
    // provider — otherwise the key belongs to a different service.
    let apiKey = platformKeyFor(overrideProvider);
    if (!apiKey) {
      const org = await loadPrimaryOrgPolicy(userId);
      if (org?.provider === overrideProvider && org?.apiKey) {
        apiKey = org.apiKey;
      }
    }

    return {
      model: buildModel(overrideProvider, overrideModel, apiKey),
      provider: overrideProvider,
      modelId: overrideModel,
    };
  }
  return getLLMForUser(userId);
}

export { DEFAULT_MODELS };
