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
    create table if not exists public.org_agent_templates (
      id uuid primary key default gen_random_uuid(),
      org_id uuid references public.organizations(id) on delete cascade not null,
      published_by uuid references public.users(id) on delete set null,
      source_slug text,
      name text not null,
      emoji text,
      description text,
      system_prompt text not null,
      enabled_tools text[] not null default '{}'::text[],
      objectives text[] default '{}'::text[],
      install_count int default 0,
      published_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  console.log("✓ org_agent_templates table");

  await client.query(
    `create index if not exists org_agent_templates_org_idx on public.org_agent_templates(org_id);`,
  );
  console.log("✓ org index");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
