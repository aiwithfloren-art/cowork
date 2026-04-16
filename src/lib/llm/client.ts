import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// meta-llama/llama-4-scout-17b-16e-instruct — Meta's newest Llama
// generation, tuned for tool use with 131K context. Llama 3.3 mis-
// called Slack tools; Scout is a stronger agentic model and smaller
// so also cheaper + faster to first token.
export const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Approx Groq pricing for Llama 4 Scout: $0.11 in / $0.34 out per 1M tokens
export const COST_PER_1M_IN = 0.11;
export const COST_PER_1M_OUT = 0.34;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
