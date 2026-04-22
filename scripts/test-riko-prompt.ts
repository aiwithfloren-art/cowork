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
 * Runs the exact user prompt through the real chat pipeline to show what
 * happens step-by-step. Verifies Qwen3 catches the intent and calls the
 * create tool.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("user missing");

  // Clean up any existing Riko test agent
  await sb.from("custom_agents").delete().eq("user_id", user.id).ilike("name", "riko%");

  const llm = await getLLMForUser(user.id as string);
  console.log(`→ model: ${llm.provider} · ${llm.modelId}\n`);

  const tools = await buildToolsForUser(user.id as string);

  const prompt =
    "butanin 1 AI employee namanya Riko buat reply DM IG, tone friendly Indo.";
  console.log(`👤 USER: ${prompt}\n`);

  const t0 = Date.now();
  const result = await generateText({
    model: llm.model,
    system:
      "You are Sigap. When user asks to create/add an AI employee or agent (any phrasing, any typo including 'butanin'), call create_ai_employee tool with extracted fields. Reply in Bahasa Indonesia.",
    messages: [{ role: "user", content: prompt }],
    tools,
    stopWhen: stepCountIs(5),
    prepareStep: async ({ messages }) => ({
      messages: stripReasoningFromMessages(messages),
    }),
  });
  const ms = Date.now() - t0;

  const toolsCalled = (result.steps ?? [])
    .flatMap((s: { toolCalls?: Array<{ toolName?: string; input?: unknown }> }) => s.toolCalls ?? []);
  console.log(`→ elapsed: ${ms}ms`);
  console.log(`→ tools called: [${toolsCalled.map((t) => t.toolName).join(", ")}]`);

  for (const tc of toolsCalled) {
    if (tc.toolName === "create_ai_employee") {
      console.log(
        `\n→ create_ai_employee args:\n${JSON.stringify(tc.input, null, 2)}`,
      );
    }
  }

  console.log(`\n🤖 REPLY:\n${result.text}`);

  // Check what got created
  const { data: created } = await sb
    .from("custom_agents")
    .select("slug, name, emoji, description, enabled_tools")
    .eq("user_id", user.id)
    .ilike("name", "%riko%");
  if (created && created.length > 0) {
    const a = created[0];
    console.log(`\n✓ Agent created in DB:`);
    console.log(`  ${a.emoji} ${a.name} (${a.slug})`);
    console.log(`  Desc: ${a.description}`);
    console.log(`  Tools: ${(a.enabled_tools as string[]).join(", ")}`);
  }

  // Cleanup
  await sb.from("custom_agents").delete().eq("user_id", user.id).ilike("name", "%riko%");
  console.log(`\n(cleaned up)`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
