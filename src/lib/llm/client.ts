import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getGroq(apiKey?: string) {
  const key = apiKey || process.env.GROQ_API_KEY!;
  return createOpenAICompatible({
    name: "groq",
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// openai/gpt-oss-120b — OpenAI's open-weights model on Groq, stronger
// tool-calling than Llama 4 Scout (which mis-formatted nullable/optional
// params for tools like list_recent_emails).
export const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Approx Groq pricing for gpt-oss-120b: $0.15 in / $0.60 out per 1M tokens
export const COST_PER_1M_IN = 0.15;
export const COST_PER_1M_OUT = 0.6;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}
