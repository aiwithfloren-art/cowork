import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

// Adds 'read_email' to Lead Gen agent's enabled_tools array on existing
// org rows. Idempotent — only appends if not already present.
const SQL = `
UPDATE public.org_agent_templates
SET enabled_tools = array_append(enabled_tools, 'read_email')
WHERE name = 'Lead Gen'
  AND NOT ('read_email' = ANY(enabled_tools));
`;

const VERIFY_SQL = `
SELECT name, enabled_tools
FROM public.org_agent_templates
WHERE name = 'Lead Gen'
ORDER BY org_id;
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
  "aws-1-us-east-1.pooler.supabase.com",
];

for (const host of hosts) {
  console.log(`Trying ${host}`);
  const client = new pg.Client({
    host, port: 5432, user: `postgres.${projectRef}`, password, database: "postgres",
    ssl: { rejectUnauthorized: false }, statement_timeout: 15000, connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    console.log("  connected");
    const result = await client.query(SQL);
    console.log(`  ✅ updated ${result.rowCount} Lead Gen rows (added 'read_email')`);
    const verify = await client.query(VERIFY_SQL);
    console.log(`  Verification (${verify.rows.length} Lead Gen rows total):`);
    for (const row of verify.rows) {
      const has = row.enabled_tools.includes("read_email") ? "✅" : "❌";
      console.log(`    ${has} ${row.enabled_tools.length} tools, read_email present: ${row.enabled_tools.includes("read_email")}`);
    }
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
