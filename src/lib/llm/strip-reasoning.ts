import type { ModelMessage } from "@ai-sdk/provider-utils";

/**
 * Strip `reasoning` content parts from assistant messages before sending
 * them back to Groq. Groq's OpenAI-compatible endpoint rejects
 * `reasoning_content` in input assistant messages (error:
 * `property 'reasoning_content' is unsupported`), even though its
 * reasoning models (qwen3, gpt-oss) emit it in their outputs. Without
 * this stripper, any multi-step tool call loop crashes on the second
 * turn when the first assistant message (with reasoning) is replayed.
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
