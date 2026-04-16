import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// llama-3.3-70b-versatile — proven to work with Vercel AI SDK + tools.
// gpt-oss-120b rejected assistant messages with reasoning_content that
// the SDK/Groq pipeline was inserting; Llama 3.3 has no such quirks.
// 131K context window. Our deterministic delegation bypass covers the
// one flow where Llama historically underperformed Kimi.
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Approx Groq pricing for Llama 3.3 70B: $0.59 in / $0.79 out per 1M tokens
export const COST_PER_1M_IN = 0.59;
export const COST_PER_1M_OUT = 0.79;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
