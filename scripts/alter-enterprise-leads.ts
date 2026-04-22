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

  await client.query(`
    create table if not exists public.enterprise_leads (
      id uuid primary key default gen_random_uuid(),
      full_name text not null,
      email text not null,
      company_website text,
      use_case text,
      team_size text,
      deployment_preference text,
      created_at timestamptz default now(),
      status text default 'new'
    );
  `);
  console.log("✓ enterprise_leads table");

  await client.query(
    `create index if not exists enterprise_leads_created_at_idx on public.enterprise_leads(created_at desc);`,
  );
  console.log("✓ index");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
