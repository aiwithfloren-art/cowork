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
 * Verify the new create_artifact tool works end-to-end:
 *   - LLM recognizes a "buatin post" intent
 *   - Calls create_artifact (not dumping content in chat)
 *   - Row lands in artifacts table
 *   - Reply is short + links to /artifacts/[id]
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

  // Clean up any prior test artifacts
  await sb
    .from("artifacts")
    .delete()
    .eq("user_id", user.id)
    .ilike("title", "%ramadhan%");

  const llm = await getLLMForUser(user.id as string);
  console.log(`→ model: ${llm.provider} · ${llm.modelId}\n`);

  const tools = await buildToolsForUser(user.id as string);

  const prompt =
    "Buatin post IG soal promo Ramadhan, diskon 20% buat paket coaching. Tone friendly Indo, cantumin hashtag. Taro CTA 'DM kita di @sigap.id'.";
  console.log(`👤 USER: ${prompt}\n`);

  const t0 = Date.now();
  const result = await generateText({
    model: llm.model,
    system:
      "You are Sigap. When user asks to draft a post/caption/email/proposal — ALWAYS call create_artifact (never paste the body in chat). Pick the right type and platform, fill hashtags/CTA/subject as appropriate. Reply in Bahasa Indonesia with ONE short sentence + the artifact link.",
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
  console.log(`→ elapsed: ${ms}ms`);
  console.log(`→ tools called: [${toolsCalled.map((t) => t.toolName).join(", ")}]`);

  for (const tc of toolsCalled) {
    if (tc.toolName === "create_artifact") {
      console.log(
        `\n→ create_artifact args:\n${JSON.stringify(tc.input, null, 2)}`,
      );
    }
  }

  console.log(`\n🤖 REPLY:\n${result.text}`);

  // Verify it landed in DB
  const { data: created } = await sb
    .from("artifacts")
    .select("id, type, platform, title, body_markdown, meta, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (created && created.length > 0) {
    const a = created[0];
    console.log(`\n✓ Artifact in DB:`);
    console.log(`  type: ${a.type}`);
    console.log(`  platform: ${a.platform ?? "—"}`);
    console.log(`  title: ${a.title}`);
    console.log(`  meta: ${JSON.stringify(a.meta)}`);
    console.log(`  body (first 200 chars): ${a.body_markdown.slice(0, 200)}…`);
    console.log(`  URL: /artifacts/${a.id}`);
  } else {
    console.log(`\n✗ NO artifact row found`);
  }

  // Cleanup — delete rows we just created for this test
  if (created && created.length > 0) {
    await sb.from("artifacts").delete().eq("id", created[0].id);
    console.log(`\n(cleaned up test artifact)`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
