// Sync custom_agents.system_prompt with latest starter-kit.ts templates.
// Used after prompt changes (e.g. hyper-directives for Flash Lite) to push
// to existing installed agents.
//
// Run: npx tsx scripts/sync-prompts-to-db.ts

import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";
import { STARTER_TEMPLATES, wrapStarterRole } from "../src/lib/starter-kit";

dns.setDefaultResultOrder("ipv4first");

async function main() {
  const env = Object.fromEntries(
    readFileSync("/Users/florentini/OpenSource Cowork/.env.local", "utf-8")
      .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
  );

  const c = new pg.Client({
    host: "aws-1-ap-northeast-1.pooler.supabase.com", port: 5432,
    user: `postgres.${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}`,
    password: env.SUPABASE_DB_PASSWORD, database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const targets = ["Content Creator", "Lead Gen", "Coder"];
  let totalUpdated = 0;

  for (const tmpl of STARTER_TEMPLATES) {
    if (!targets.includes(tmpl.name)) continue;
    const role = Array.isArray(tmpl.role) ? tmpl.role.join("\n") : tmpl.role;
    const wrapped = wrapStarterRole(role);
    const r = await c.query(
      "UPDATE public.custom_agents SET system_prompt = $1 WHERE name = $2",
      [wrapped, tmpl.name],
    );
    console.log(`✅ ${tmpl.name}: synced ${r.rowCount} agent(s) — prompt length ${wrapped.length} chars`);
    totalUpdated += r.rowCount ?? 0;
  }

  console.log(`\nTotal agents updated: ${totalUpdated}`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
