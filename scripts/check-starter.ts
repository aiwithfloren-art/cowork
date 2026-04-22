/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb
    .from("org_agent_templates")
    .select("name, emoji, description, enabled_tools, objectives")
    .order("published_at", { ascending: false });
  for (const t of data ?? []) {
    console.log(`\n${t.emoji} ${t.name}`);
    console.log(`   ${t.description}`);
    console.log(`   tools: ${(t.enabled_tools as string[])?.join(", ")}`);
    console.log(`   objectives: ${((t.objectives as string[]) ?? []).length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
