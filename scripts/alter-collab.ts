/* eslint-disable */
// Adds shared-notes columns + notifications table.
// Run: npx tsx scripts/alter-collab.ts

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) throw new Error("Could not derive project ref");

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
    alter table public.notes
      add column if not exists visibility text default 'private'
      check (visibility in ('private', 'team', 'org'));
  `);
  console.log("✓ notes.visibility added");

  await client.query(`
    alter table public.notes
      add column if not exists org_id uuid references public.organizations(id) on delete set null;
  `);
  console.log("✓ notes.org_id added");

  await client.query(`
    create index if not exists notes_org_visibility on public.notes(org_id, visibility, created_at desc);
  `);
  console.log("✓ notes index");

  await client.query(`
    create table if not exists public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.users(id) on delete cascade,
      actor_id uuid references public.users(id) on delete set null,
      kind text not null,
      title text not null,
      body text,
      link text,
      read_at timestamptz,
      created_at timestamptz default now()
    );
  `);
  console.log("✓ notifications table");

  await client.query(`
    create index if not exists notifications_user_unread on public.notifications(user_id, read_at, created_at desc);
  `);
  console.log("✓ notifications index");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
