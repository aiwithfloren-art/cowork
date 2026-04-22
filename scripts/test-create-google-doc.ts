/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateText, stepCountIs } from "ai";
import { createClient } from "@supabase/supabase-js";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildToolsForUser } from "../src/lib/llm/build-tools";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

/**
 * Verify create_google_doc wires end-to-end — LLM calls the tool,
 * Doc lands in Drive, URL is returned + surfaced in reply.
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
  if (!user) throw new Error("user missing");

  const llm = await getLLMForUser(user.id as string);
  console.log(`→ model: ${llm.provider} · ${llm.modelId}\n`);

  const tools = await buildToolsForUser(user.id as string);

  const prompt =
    "Buatin Google Doc judulnya 'Test Artifact Sigap' isinya: heading 'Hello', bullet list 3 item soal produktivitas, terus paragraf closing.";
  console.log(`👤 USER: ${prompt}\n`);

  const t0 = Date.now();
  const result = await generateText({
    model: llm.model,
    system:
      "You are Sigap. When user asks to create a Google Doc, call create_google_doc. Never fabricate success.",
    messages: [{ role: "user", content: prompt }],
    tools,
    stopWhen: stepCountIs(3),
    prepareStep: async ({ messages }) => ({
      messages: stripReasoningFromMessages(messages),
    }),
  });
  const ms = Date.now() - t0;

  const toolsCalled = (result.steps ?? []).flatMap(
    (s: { toolCalls?: Array<{ toolName?: string; input?: unknown }> }) =>
      s.toolCalls ?? [],
  );
  const toolResults = (result.steps ?? []).flatMap(
    (s: { toolResults?: Array<{ toolName?: string; output?: unknown }> }) =>
      s.toolResults ?? [],
  );
  console.log(`→ elapsed: ${ms}ms`);
  console.log(`→ tools called: [${toolsCalled.map((t) => t.toolName).join(", ")}]`);

  for (const tc of toolsCalled) {
    if (tc.toolName === "create_google_doc") {
      console.log(`\n→ args:\n${JSON.stringify(tc.input, null, 2).slice(0, 500)}`);
    }
  }
  for (const tr of toolResults) {
    if (tr.toolName === "create_google_doc") {
      console.log(`\n→ result:\n${JSON.stringify(tr.output, null, 2)}`);
    }
  }

  console.log(`\n🤖 REPLY:\n${result.text}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
