import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const env = Object.fromEntries(
  readFileSync("/Users/florentini/OpenSource Cowork/.env.local", "utf-8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const password = env.SUPABASE_DB_PASSWORD;
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

const client = new pg.Client({
  host: "aws-1-ap-northeast-1.pooler.supabase.com", port: 5432,
  user: `postgres.${projectRef}`, password, database: "postgres",
  ssl: { rejectUnauthorized: false }, statement_timeout: 15000,
});
await client.connect();

// Find users that have Content Creator and Lead Gen agents installed
const r = await client.query(`
  SELECT u.id as user_id, u.email,
    array_agg(DISTINCT ca.name) FILTER (WHERE ca.name IS NOT NULL) as agents
  FROM public.users u
  LEFT JOIN public.custom_agents ca ON ca.user_id = u.id
  WHERE ca.name IN ('Content Creator', 'Lead Gen', 'Coder')
  GROUP BY u.id, u.email
  ORDER BY u.created_at DESC
  LIMIT 5
`);
for (const row of r.rows) {
  console.log(`${row.user_id} ${row.email} | agents: ${(row.agents || []).join(", ")}`);
}
await client.end();
