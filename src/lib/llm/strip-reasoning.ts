import type { ModelMessage } from "@ai-sdk/provider-utils";

/**
 * Strip `reasoning` content parts from assistant messages before replaying
 * them in the next turn. Some OpenAI-compatible endpoints (including
 * certain OpenRouter upstream providers) reject `reasoning_content`
 * in input assistant messages with:
 *   `property 'reasoning_content' is unsupported`
 * Even though reasoning models (gpt-oss, deepseek thinking, qwen3) emit
 * these parts in their outputs. Without this stripper, multi-step tool
 * call loops crash on the second turn when the first assistant message
 * (with reasoning) is replayed.
 */
export function stripReasoningFromMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    if (typeof m.content === "string") return m;
    return {
      ...m,
      content: m.content.filter((p) => p.type !== "reasoning"),
    };
  });
}
