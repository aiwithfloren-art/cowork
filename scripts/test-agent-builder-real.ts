/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptAgentCreate } from "../src/lib/llm/agent-intercept";

/**
 * Test the EXACT phrasing the user reported as failing. Verify intercept
 * now fires + builder either asks clarifying question or creates agent.
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

  // Clean up any prior test-created agent
  await sb
    .from("custom_agents")
    .delete()
    .eq("user_id", user.id)
    .like("slug", "linkedin-writer%");

  const message =
    "buatkan 1 ai employees yang khusus untuk bisa generate linkedin post everyday berdasarkan viral news yang berkaitan dengan our company jadi soft selling namanya (linkedin writer)";

  console.log("👤 USER:", message, "\n");
  const t0 = Date.now();
  const reply = await tryInterceptAgentCreate(user.id as string, message, []);
  console.log(`→ intercept elapsed: ${Date.now() - t0}ms\n`);

  if (!reply) {
    console.log("✗ INTERCEPT DID NOT FIRE (bug — regex still broken)");
    process.exit(1);
  }

  console.log("🤖 SIGAP REPLY:");
  console.log(reply);

  // If reply starts with ✅ (creation) or 🤖 Agent Builder: (question), good
  const ok = reply.startsWith("✅") || reply.includes("🤖 Agent Builder:");
  console.log(`\n${ok ? "✓" : "✗"} intercept flow ${ok ? "worked" : "malfunctioned"}`);

  // Check if agent was created
  const { data: created } = await sb
    .from("custom_agents")
    .select("slug, name, emoji, enabled_tools")
    .eq("user_id", user.id)
    .like("name", "%inkedin%");
  if (created && created.length > 0) {
    console.log(`\n✓ Agent created: ${created[0].emoji} ${created[0].name} (${created[0].slug})`);
    console.log(`  tools: ${(created[0].enabled_tools as string[]).join(", ")}`);
  } else {
    console.log(
      `\n→ No agent created yet — builder probably asking a clarifying question first (that's the normal multi-turn flow)`,
    );
  }
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
