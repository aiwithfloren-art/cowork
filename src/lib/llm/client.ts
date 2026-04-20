import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// meta-llama/llama-4-maverick-17b-128e-instruct — Llama 4's larger
// variant. Scout (17b-16e) mis-formatted nullable/optional tool params;
// gpt-oss-120b is a reasoning model whose reasoning_content field is
// rejected by Groq on subsequent turns. Maverick has stronger tool use
// than Scout without reasoning-token incompatibility.
export const DEFAULT_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";

// Approx Groq pricing for Llama 4 Maverick: $0.20 in / $0.60 out per 1M tokens
export const COST_PER_1M_IN = 0.2;
export const COST_PER_1M_OUT = 0.6;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
