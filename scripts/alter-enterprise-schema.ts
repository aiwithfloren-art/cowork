/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Sprint 1.3 migrations — Enterprise foundation:
 *   - organizations.tier: track solo/team/enterprise billing tier
 *   - org_agent_templates.share_token: invite-link mechanism
 *   - org_agent_templates.visibility: gate who can see this employee
 *   - org_agent_templates.auto_deploy: auto-install on new member join
 *   - org_agent_templates.allowed_tools: per-employee tool whitelist
 *   - connectors.org_id: enable org-level shared connectors
 *   - connectors.user_id drop-not-null: allow org-only rows
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

  // Organizations — tier
  await client.query(
    `alter table public.organizations add column if not exists tier text default 'solo';`,
  );
  console.log("✓ organizations.tier");

  // Org agent templates
  await client.query(
    `alter table public.org_agent_templates add column if not exists share_token text unique;`,
  );
  console.log("✓ org_agent_templates.share_token");

  await client.query(
    `alter table public.org_agent_templates add column if not exists visibility text default 'all' check (visibility in ('all', 'manager_only', 'owner_only'));`,
  );
  console.log("✓ org_agent_templates.visibility");

  await client.query(
    `alter table public.org_agent_templates add column if not exists auto_deploy boolean default false;`,
  );
  console.log("✓ org_agent_templates.auto_deploy");

  await client.query(
    `alter table public.org_agent_templates add column if not exists allowed_tools text[] default '{}'::text[];`,
  );
  console.log("✓ org_agent_templates.allowed_tools");

  // Connectors — enable org-level rows
  await client.query(
    `alter table public.connectors add column if not exists org_id uuid references public.organizations(id) on delete cascade;`,
  );
  console.log("✓ connectors.org_id");

  await client.query(
    `alter table public.connectors alter column user_id drop not null;`,
  );
  console.log("✓ connectors.user_id nullable");

  // Unique: either (user_id, provider) for personal or (org_id, provider) for org.
  // Drop old uniqueness if present — we'll rely on partial indices.
  await client.query(
    `alter table public.connectors drop constraint if exists connectors_user_id_provider_key;`,
  );

  await client.query(
    `create unique index if not exists connectors_user_provider_uniq
       on public.connectors (user_id, provider)
       where user_id is not null and org_id is null;`,
  );
  await client.query(
    `create unique index if not exists connectors_org_provider_uniq
       on public.connectors (org_id, provider)
       where org_id is not null;`,
  );
  console.log("✓ connectors partial unique indices");

  await client.query(
    `create index if not exists connectors_org_idx on public.connectors(org_id) where org_id is not null;`,
  );
  console.log("✓ connectors org index");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
