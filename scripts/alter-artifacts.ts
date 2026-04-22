/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Create artifacts table — Claude-Artifacts-style deliverables.
 * Every drafted post/email/proposal/caption/document lives as a row
 * with a permanent URL at /artifacts/[id], plus Copy/Edit/Delete actions.
 */
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
    create table if not exists public.artifacts (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.users(id) on delete cascade not null,
      agent_id uuid,
      type text not null check (type in ('post', 'email', 'proposal', 'caption', 'document')),
      platform text,
      title text not null,
      body_markdown text not null default '',
      meta jsonb not null default '{}'::jsonb,
      thumbnail_url text,
      status text not null default 'draft' check (status in ('draft', 'sent', 'archived')),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  console.log("✓ artifacts table");

  await client.query(
    `create index if not exists artifacts_user_created on public.artifacts(user_id, created_at desc);`,
  );
  await client.query(
    `create index if not exists artifacts_user_type on public.artifacts(user_id, type);`,
  );
  console.log("✓ indexes");

  await client.query(`alter table public.artifacts enable row level security;`);
  console.log("✓ RLS enabled");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
