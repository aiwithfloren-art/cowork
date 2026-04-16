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
    create table if not exists public.connectors (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.users(id) on delete cascade,
      provider text not null,
      access_token text not null,
      refresh_token text,
      expires_at timestamptz,
      scope text,
      external_account_id text,
      external_account_label text,
      metadata jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (user_id, provider)
    );
  `);
  console.log("✓ connectors table");

  await client.query(`
    create index if not exists connectors_user on public.connectors(user_id);
  `);
  console.log("✓ connectors index");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
