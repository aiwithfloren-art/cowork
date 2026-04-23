/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Approval queue — pause sensitive tool calls (send_email, broadcast,
 * assign_task, etc) until a manager/owner taps Allow. Org-level policy
 * column declares which tool slugs require approval.
 *
 * Trust-unlock pattern inspired by OpenWork's approval queue — adapted
 * for SaaS (Supabase table + notification row) instead of in-memory map.
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
    create table if not exists public.pending_approvals (
      id uuid primary key default gen_random_uuid(),
      requester_id uuid references public.users(id) on delete cascade not null,
      org_id uuid references public.organizations(id) on delete cascade,
      agent_id uuid,
      tool_name text not null,
      tool_args jsonb not null default '{}'::jsonb,
      summary text,
      status text not null default 'pending' check (status in ('pending','approved','denied','timeout','executed','failed')),
      decided_by uuid references public.users(id) on delete set null,
      decided_at timestamptz,
      result_summary text,
      created_at timestamptz default now(),
      expires_at timestamptz not null
    );
  `);
  console.log("✓ pending_approvals table");

  await client.query(
    `create index if not exists pending_approvals_org_status on public.pending_approvals(org_id, status, created_at desc);`,
  );
  await client.query(
    `create index if not exists pending_approvals_requester on public.pending_approvals(requester_id, created_at desc);`,
  );
  console.log("✓ indexes");

  await client.query(
    `alter table public.organizations add column if not exists require_approval_for text[] default '{}'::text[];`,
  );
  console.log("✓ organizations.require_approval_for");

  await client.query(`alter table public.pending_approvals enable row level security;`);
  console.log("✓ RLS enabled");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
