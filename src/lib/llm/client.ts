import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Approx Groq pricing as of late 2024: $0.59 in / $0.79 out per 1M tokens for Llama 3.3 70B
export const COST_PER_1M_IN = 0.59;
export const COST_PER_1M_OUT = 0.79;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
