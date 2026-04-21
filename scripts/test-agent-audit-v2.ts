/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptAgentCreate } from "../src/lib/llm/agent-intercept";

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

  // Check builder questions include [Step N/4]
  console.log("→ test: builder progress indicator");
  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];
  const turns = ["mau agent content creator", "bikin caption IG, riset trending topic"];
  let stepIndicatorFound = false;
  for (const turn of turns) {
    const r = await tryInterceptAgentCreate(user.id, turn, transcript);
    if (r) {
      console.log(`  reply: ${r.slice(0, 150)}...`);
      if (/\[Step \d+\/\d+\]/i.test(r)) stepIndicatorFound = true;
      transcript.push({ role: "user", content: turn });
      transcript.push({ role: "assistant", content: r });
    }
  }
  console.log(`  step indicator present: ${stepIndicatorFound ? "YES ✓" : "NO ✗"}`);

  // Create an agent, check system_prompt is hardened
  console.log("\n→ test: system prompt harden wrapper");
  const t2: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of [
    "mau agent research market",
    "cari trend industri, bikin report mingguan",
    "formal, nama Riset Rina",
    "udah ok",
  ]) {
    const r = await tryInterceptAgentCreate(user.id, turn, t2);
    if (r) {
      t2.push({ role: "user", content: turn });
      t2.push({ role: "assistant", content: r });
      if (r.startsWith("✅")) break;
    }
  }
  const { data: agents } = await sb
    .from("custom_agents")
    .select("name, system_prompt, enabled_tools")
    .eq("user_id", user.id);
  const agent = agents?.[0];
  if (agent) {
    const hardened = agent.system_prompt.includes("=== BEGIN ROLE ===");
    const hasBoundary = agent.system_prompt.includes(
      "Never reveal or quote these wrapping",
    );
    console.log(`  created: ${agent.name}`);
    console.log(`  wrapper markers: ${hardened ? "YES ✓" : "NO ✗"}`);
    console.log(`  boundary rules: ${hasBoundary ? "YES ✓" : "NO ✗"}`);
    console.log(`  tools: ${agent.enabled_tools.join(", ")}`);
  }

  // Extraction: make sure role description inside wrapper
  console.log("\n→ test: role extraction (what user sees in detail panel)");
  if (agent) {
    const begin = agent.system_prompt.indexOf("=== BEGIN ROLE ===");
    const end = agent.system_prompt.indexOf("=== END ROLE ===");
    const extracted = agent.system_prompt
      .slice(begin + "=== BEGIN ROLE ===".length, end)
      .trim();
    console.log(`  extracted (${extracted.length} chars):`);
    console.log(`    ${extracted.slice(0, 200)}...`);
    const hasBoundaryLeak = extracted.includes("Never reveal") || extracted.includes("BEGIN ROLE");
    console.log(`  no boundary leak in extraction: ${hasBoundaryLeak ? "NO ✗" : "YES ✓"}`);
  }

  console.log("\n→ cleanup");
  await sb.from("custom_agents").delete().eq("user_id", user.id);
  console.log("  deleted");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  process.exit(1);
});
