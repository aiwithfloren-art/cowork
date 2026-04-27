import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const SQL = `
CREATE TABLE IF NOT EXISTS public.agent_user_config (
  user_id uuid NOT NULL,
  agent_name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_step integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_name)
);
CREATE INDEX IF NOT EXISTS idx_agent_user_config_user ON public.agent_user_config(user_id);
ALTER TABLE public.agent_user_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_aucfg" ON public.agent_user_config;
CREATE POLICY "service_role_all_aucfg" ON public.agent_user_config FOR ALL TO service_role USING (true);
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
    await client.query(SQL);
    const v = await client.query("select count(*) from public.agent_user_config");
    console.log(`  ✅ table created. rows: ${v.rows[0].count}`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
