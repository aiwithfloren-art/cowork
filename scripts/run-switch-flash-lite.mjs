import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

// Switch all agents with explicit gpt-4o-mini override → Gemini Flash Lite.
// Idempotent.
const SQL = `
UPDATE public.org_agent_templates
SET llm_override_model = 'google/gemini-2.5-flash-lite'
WHERE llm_override_model = 'openai/gpt-4o-mini';
`;

const VERIFY_SQL = `
SELECT name, llm_override_model, count(*) as orgs
FROM public.org_agent_templates
WHERE llm_override_provider IS NOT NULL
GROUP BY name, llm_override_model
ORDER BY name;
`;

const envFile = readFileSync("/Users/florentini/OpenSource Cowork/.env.local", "utf-8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => {
    const idx = l.indexOf("=");
    return [l.slice(0, idx), l.slice(idx + 1)];
  }),
);
const password = env.SUPABASE_DB_PASSWORD;
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

const hosts = [
  "aws-1-ap-northeast-1.pooler.supabase.com",
  "aws-1-ap-southeast-1.pooler.supabase.com",
];

for (const host of hosts) {
  console.log(`Trying ${host}`);
  const client = new pg.Client({
    host, port: 5432, user: `postgres.${projectRef}`, password, database: "postgres",
    ssl: { rejectUnauthorized: false }, statement_timeout: 15000, connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const result = await client.query(SQL);
    console.log(`  ✅ updated ${result.rowCount} rows`);
    const verify = await client.query(VERIFY_SQL);
    console.log("  Current state:");
    for (const row of verify.rows) {
      console.log(`    ${row.name} → ${row.llm_override_model} (${row.orgs} orgs)`);
    }
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
