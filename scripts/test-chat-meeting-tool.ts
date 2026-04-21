/* eslint-disable */
// Direct test of the AI flow when user asks to start a meeting bot.
// Bypasses HTTP — calls generateText the same way /api/chat does.
// This isolates whether the bug is in the chat route or the tool itself.
//
// Run: npx tsx scripts/test-chat-meeting-tool.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL } from "../src/lib/llm/client";
import { buildToolsForUser } from "../src/lib/llm/build-tools";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

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
  if (!user) throw new Error("user not found");
  console.log(`→ user ${user.id}`);

  const groq = getGroq();
  const tools = await buildToolsForUser(user.id);
  console.log(`→ ${Object.keys(tools).length} tools loaded`);
  console.log(`  has start_meeting_bot:`, !!(tools as any).start_meeting_bot);

  const prompt = "rekam meeting ini https://meet.google.com/abc-defg-hij";
  console.log(`\n→ prompt: ${prompt}`);

  const t0 = Date.now();
  const result = await generateText({
    model: groq(DEFAULT_MODEL),
    system:
      "You are Sigap. Call tools for real actions. When user says 'rekam meeting', call start_meeting_bot with the given URL.",
    messages: [{ role: "user", content: prompt }],
    tools,
    stopWhen: stepCountIs(4),
    prepareStep: async ({ messages }) => ({
      messages: stripReasoningFromMessages(messages),
    }),
  });
  console.log(`← ${Date.now() - t0}ms`);
  console.log(`\ntext: ${result.text}`);
  console.log(`\ntool calls:`, result.toolCalls?.length ?? 0);
  for (const call of result.toolCalls ?? []) {
    console.log(`  - ${call.toolName}(${JSON.stringify(call.input)})`);
  }
  console.log(`\ntool results:`, result.toolResults?.length ?? 0);
  for (const r of result.toolResults ?? []) {
    console.log(`  - ${(r as any).toolName}:`, JSON.stringify((r as any).output).slice(0, 300));
  }
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
