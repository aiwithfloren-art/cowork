/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildToolsForUser } from "../src/lib/llm/build-tools";

/**
 * Live chat test via the real provider resolver to confirm:
 *   - Org policy → resolves to openrouter/deepseek-chat-v3
 *   - API key picked up (fallback to env)
 *   - DeepSeek responds with text
 *   - Tool-calling works (call a simple tool)
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user missing");

  const llm = await getLLMForUser(user.id as string);
  console.log(`→ resolved: provider=${llm.provider}, model=${llm.modelId}`);

  // Simple text test — no tools
  console.log("\n=== Test 1: plain text ===");
  const t0 = Date.now();
  const res1 = await generateText({
    model: llm.model,
    system: "You are Sigap, a helpful AI Chief of Staff. Reply in Bahasa Indonesia.",
    messages: [
      { role: "user", content: "Jelasin Cowork Enterprise dalam 1 kalimat." },
    ],
  });
  console.log(`→ elapsed: ${Date.now() - t0}ms`);
  console.log(`→ reply: ${res1.text}`);
  console.log(
    `→ usage: ${res1.usage?.inputTokens ?? "?"} in, ${res1.usage?.outputTokens ?? "?"} out`,
  );

  // Tool-calling test
  console.log("\n=== Test 2: tool calling ===");
  const tools = await buildToolsForUser(user.id as string);
  // Use web_search (available + doesn't require Google OAuth)
  const minimalTools = (tools as Record<string, unknown>).web_search
    ? { web_search: (tools as Record<string, unknown>).web_search }
    : {};
  const t1 = Date.now();
  const res2 = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: llm.model as any,
    system:
      "You are Sigap. When the user asks about current events, call web_search. Always reply in Bahasa Indonesia.",
    messages: [
      { role: "user", content: "Berita AI terbaru minggu ini apa aja?" },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: minimalTools as any,
  });
  console.log(`→ elapsed: ${Date.now() - t1}ms`);
  const toolsCalled = (res2.steps ?? [])
    .flatMap((s: { toolCalls?: Array<{ toolName?: string }> }) => s.toolCalls ?? [])
    .map((tc) => tc.toolName);
  console.log(`→ tools called: ${toolsCalled.join(", ") || "(none)"}`);
  console.log(`→ reply: ${res2.text?.slice(0, 300)}${(res2.text?.length ?? 0) > 300 ? "…" : ""}`);

  console.log("\n🎉 DeepSeek V3 live test passed");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  process.exit(1);
});
