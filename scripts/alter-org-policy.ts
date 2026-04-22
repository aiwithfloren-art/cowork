/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]!;

  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("✓ connected");

  await client.query(
    `alter table public.organizations add column if not exists llm_provider text default 'groq';`,
  );
  console.log("✓ organizations.llm_provider");

  await client.query(
    `alter table public.organizations add column if not exists llm_model text;`,
  );
  console.log("✓ organizations.llm_model");

  // BYO API key for the chosen provider. Null means "use the platform's key"
  // (SaaS default). For self-host deployments admins set their own.
  await client.query(
    `alter table public.organizations add column if not exists llm_api_key text;`,
  );
  console.log("✓ organizations.llm_api_key");

  // Per-member daily message cap. Null means "inherit platform default".
  await client.query(
    `alter table public.organizations add column if not exists daily_quota_per_member int;`,
  );
  console.log("✓ organizations.daily_quota_per_member");

  // Optional whitelist of tool slugs allowed for this org. Empty array
  // (default) means "all tools allowed" — existing behavior.
  await client.query(
    `alter table public.organizations add column if not exists allowed_tools text[] default '{}'::text[];`,
  );
  console.log("✓ organizations.allowed_tools");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
