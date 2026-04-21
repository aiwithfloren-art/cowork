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
  console.log(`→ user ${user.id}`);

  const cases = [
    {
      label: "HR agent with name",
      msg: "bikin agent Siska buat HR, bisa bantu onboarding, leave tracking, kirim reminder",
    },
    {
      label: "Sales agent no name",
      msg: "bikin agent buat sales follow up leads dan draft outreach email",
    },
    {
      label: "no match",
      msg: "halo apa kabar",
    },
  ];

  for (const c of cases) {
    console.log(`\n→ case: ${c.label}`);
    console.log(`  msg: "${c.msg}"`);
    const t0 = Date.now();
    const result = await tryInterceptAgentCreate(user.id, c.msg);
    const ms = Date.now() - t0;
    console.log(`  [${ms}ms] match=${result !== null}`);
    if (result) console.log(`  reply:\n    ${result.replace(/\n/g, "\n    ")}`);
  }

  console.log("\n→ cleanup test agents");
  const { data: created } = await sb
    .from("custom_agents")
    .select("id, slug, name")
    .eq("user_id", user.id);
  console.log(`  found ${created?.length ?? 0} agents:`);
  for (const a of created ?? []) console.log(`    - ${a.name} (${a.slug})`);
  if (created && created.length > 0) {
    const { error } = await sb
      .from("custom_agents")
      .delete()
      .eq("user_id", user.id);
    console.log(`  deleted all: ${error?.message ?? "ok"}`);
  }
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
