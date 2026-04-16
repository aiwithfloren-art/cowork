import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// openai/gpt-oss-120b — Groq removed Kimi K2 from the public catalog,
// so we switched to OpenAI's open-source 120B. It's explicitly tuned
// for tool/function calling, has a 131K context window, and is the
// strongest option in Groq's current lineup for multi-step agent work.
export const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Approx Groq pricing for gpt-oss-120b: $0.15 in / $0.75 out per 1M tokens
export const COST_PER_1M_IN = 0.15;
export const COST_PER_1M_OUT = 0.75;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
