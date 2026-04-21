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
  console.log(`→ user ${user.id}\n`);

  // Simulate a real back-and-forth.
  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];
  const userTurns = [
    "aku pengen punya agent", // vague initial
    "buat HR", // role
    "onboarding, leave tracking, reminder karyawan", // tasks
    "Siska, tone casual", // name + tone
    "ya siapkan", // confirm
  ];

  for (const input of userTurns) {
    console.log(`👤 USER: ${input}`);
    const t0 = Date.now();
    const reply = await tryInterceptAgentCreate(user.id, input, transcript);
    const ms = Date.now() - t0;
    if (!reply) {
      console.log(`  (intercept did not fire — fell through to main LLM)\n`);
      break;
    }
    console.log(`🤖 SIGAP [${ms}ms]: ${reply}\n`);
    transcript.push({ role: "user", content: input });
    transcript.push({ role: "assistant", content: reply });
  }

  console.log("\n→ cleanup");
  const { data: created } = await sb
    .from("custom_agents")
    .select("slug, name")
    .eq("user_id", user.id);
  console.log(`  created: ${(created ?? []).map((a) => a.name).join(", ") || "none"}`);
  if (created && created.length > 0) {
    await sb.from("custom_agents").delete().eq("user_id", user.id);
    console.log("  deleted all");
  }
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
