import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

// M4: Content Creator proactive mode — adds Brave Search rate limit
// counters on the organizations table. Idempotent.
const SQL = `
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brave_search_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brave_search_reset_at timestamptz NOT NULL DEFAULT now();
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
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-1-ap-northeast-1.pooler.supabase.com",
  "aws-1-us-east-1.pooler.supabase.com",
  "aws-1-us-west-1.pooler.supabase.com",
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
    await client.query(SQL);
    console.log("  ✅ M4 columns added (brave_search_count, brave_search_reset_at)");
    const v = await client.query(
      "select count(*) as n from public.organizations where brave_search_count is not null",
    );
    console.log(`  organizations rows: ${v.rows[0].n}`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
