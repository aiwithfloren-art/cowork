import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// Kimi K2 is tuned for agentic/tool-calling workflows and handles
// multi-step chains + complex Zod schemas much better than Llama 3.3.
export const DEFAULT_MODEL = "moonshotai/kimi-k2-instruct-0905";

// Approx Groq pricing for Kimi K2: $1.00 in / $3.00 out per 1M tokens
export const COST_PER_1M_IN = 1.0;
export const COST_PER_1M_OUT = 3.0;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
