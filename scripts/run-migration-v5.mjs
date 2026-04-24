import { readFileSync } from "node:fs";
import pg from "pg";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const sql = readFileSync(
  "/Users/florentini/OpenSource Cowork/supabase/schema_v5.sql",
  "utf-8",
);

const envFile = readFileSync(
  "/Users/florentini/OpenSource Cowork/.env.local",
  "utf-8",
);
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const password = env.SUPABASE_DB_PASSWORD;
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

const candidates = [
  { host: "aws-1-ap-southeast-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-us-east-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-us-west-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-eu-central-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-eu-west-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-ap-northeast-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-1-ap-southeast-2.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-0-ap-southeast-1.pooler.supabase.com", user: `postgres.${projectRef}` },
  { host: "aws-0-us-east-1.pooler.supabase.com", user: `postgres.${projectRef}` },
];

for (const { host, user } of candidates) {
  console.log(`\nTrying ${host} as ${user}`);
  const client = new pg.Client({
    host,
    port: 5432,
    user,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15000,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    console.log("  ✅ connected");
    await client.query(sql);
    console.log("  ✅ migration executed");
    const verify = await client.query(
      "select count(*) from information_schema.columns where table_name='user_settings' and column_name='groq_key';",
    );
    console.log(`  groq_key column exists: ${verify.rows[0].count === "1" ? "YES (migration failed)" : "no (dropped)"}`);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    try {
      await client.end();
    } catch {}
  }
}
console.error("\nAll connection attempts failed.");
process.exit(1);
