/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  tryInterceptAgentCreate,
  tryInterceptAgentEdit,
  tryInterceptAgentDelete,
} from "../src/lib/llm/agent-intercept";

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

  // Clean slate
  await sb.from("custom_agents").delete().eq("user_id", user.id);

  console.log("=== Batch A: #1 Language-aware boundary ===");
  console.log("\n→ Create ID-language agent");
  const t: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of [
    "mau bikin agen riset Indonesia",
    "riset pasar retail dan kompetitor, nada formal, nama Rina",
    "ok, siapkan agen Rina",
    "ya, buat sekarang",
    "ya langsung aja buat Rina",
  ]) {
    const r = await tryInterceptAgentCreate(user.id, turn, t);
    console.log(`    turn: "${turn}" → ${r?.slice(0, 80)}`);
    if (r) {
      t.push({ role: "user", content: turn });
      t.push({ role: "assistant", content: r });
      if (r.startsWith("✅")) break;
    }
  }
  const { data: agent } = await sb
    .from("custom_agents")
    .select("name, system_prompt")
    .eq("user_id", user.id)
    .maybeSingle();
  const isIdBoundary = agent?.system_prompt.includes(
    "Kamu adalah sub-agent",
  );
  console.log(`  agent: ${agent?.name}`);
  console.log(`  ID boundary used: ${isIdBoundary ? "YES ✓" : "NO ✗"}`);

  console.log("\n=== Batch A: #2 Rate limit cooldown ===");
  const cd = await tryInterceptAgentCreate(
    user.id,
    "mau bikin agent lagi buat sales",
    [],
  );
  console.log(`  immediate retry reply: ${cd?.slice(0, 100)}`);
  const isCooldown = cd?.includes("cooldown") || cd?.includes("Tunggu");
  console.log(`  cooldown triggered: ${isCooldown ? "YES ✓" : "NO ✗"}`);

  console.log("\n=== Batch C: #14 Delete intercept ===");
  await new Promise((r) => setTimeout(r, 1200));
  const del = await tryInterceptAgentDelete(user.id, "hapus agent Rina");
  console.log(`  reply: ${del}`);
  const deleted = del?.includes("🗑️");
  const { count } = await sb
    .from("custom_agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  console.log(`  delete acknowledged: ${deleted ? "YES ✓" : "NO ✗"}`);
  console.log(`  DB count after: ${count} (expect 0)`);

  console.log("\n=== Batch C: #8 Agents list in Sigap main (checked in chat route) ===");
  console.log("  (visual inspection — checked in chat/route.ts code)");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
