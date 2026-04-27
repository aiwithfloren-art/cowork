import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const SQL = `
CREATE TABLE IF NOT EXISTS public.lead_gen_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  spreadsheet_id text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  UNIQUE(user_id, spreadsheet_id)
);
CREATE INDEX IF NOT EXISTS idx_leadgen_sheets_user ON public.lead_gen_sheets(user_id);
ALTER TABLE public.lead_gen_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.lead_gen_sheets;
CREATE POLICY "service_role_all" ON public.lead_gen_sheets FOR ALL TO service_role USING (true);
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
    console.log("  ✅ table created");
    const v = await client.query("select count(*) from public.lead_gen_sheets");
    console.log(`  table rows: ${v.rows[0].count}`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
