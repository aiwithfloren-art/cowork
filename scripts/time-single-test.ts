/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL } from "../src/lib/llm/client";
import { buildToolsForUser } from "../src/lib/llm/build-tools";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: u } = await sb
    .from("users")
    .select("id")
    .eq("email", "aiwithfloren@gmail.com")
    .single();
  const groq = getGroq();
  const tools = await buildToolsForUser(u!.id);
  console.log(`tools: ${Object.keys(tools).length}, model: ${DEFAULT_MODEL}`);

  const t0 = Date.now();
  const r = await generateText({
    model: groq(DEFAULT_MODEL),
    system: "You are Sigap. Reply briefly.",
    messages: [{ role: "user", content: "liat email saya" }],
    tools,
    stopWhen: stepCountIs(6),
    prepareStep: async ({ messages }) => ({
      messages: stripReasoningFromMessages(messages),
    }),
  });
  const t1 = Date.now();
  console.log(`\nTotal: ${((t1 - t0) / 1000).toFixed(1)}s`);
  console.log(`Steps: ${r.steps?.length}`);
  const tcs = (r.steps ?? [])
    .flatMap((s: any) => s.toolCalls ?? [])
    .map((tc: any) => tc.toolName);
  console.log(`Tools: ${tcs.join(", ")}`);
  console.log(`Text: ${(r.text || "").slice(0, 200)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
