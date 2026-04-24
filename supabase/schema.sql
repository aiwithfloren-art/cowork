-- Cowork - Database Schema
-- Paste this into Supabase SQL Editor and run.

-- ============ USERS & AUTH ============
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  image text,
  timezone text default 'Asia/Jakarta',
  created_at timestamptz default now()
);

-- Google OAuth tokens (encrypted via Supabase Vault if possible)
create table if not exists public.google_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz default now()
);

-- User settings (model choice — kept for future per-user model preference)
create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  model text default 'llama-3.3-70b-versatile',
  created_at timestamptz default now()
);

-- ============ RATE LIMIT & BUDGET ============
create table if not exists public.usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  org_id uuid,
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd numeric(10, 6) default 0,
  model text,
  created_at timestamptz default now()
);
create index if not exists usage_log_user_day on public.usage_log(user_id, created_at desc);

-- ============ CHAT & NOTES ============
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  role text check (role in ('user', 'assistant', 'system', 'tool')),
  content text,
  tool_calls jsonb,
  created_at timestamptz default now()
);
create index if not exists chat_messages_user on public.chat_messages(user_id, created_at);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  content text not null,
  type text default 'general' check (type in ('general', 'user', 'feedback', 'project', 'reference')),
  visibility text default 'private' check (visibility in ('private', 'team', 'org')),
  org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists notes_org_visibility on public.notes(org_id, visibility, created_at desc);

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
create index if not exists notifications_user_unread on public.notifications(user_id, read_at, created_at desc);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  date date not null,
  content text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- ============ ORGANIZATIONS (Phase 2 Lite) ============
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid references public.users(id) on delete set null,
  description text,
  brand_tone text,
  websites text[] default '{}'::text[],
  created_at timestamptz default now()
);

alter table public.organizations add column if not exists description text;
alter table public.organizations add column if not exists brand_tone text;
alter table public.organizations add column if not exists websites text[] default '{}'::text[];
alter table public.organizations add column if not exists llm_provider text default 'openrouter';
alter table public.organizations add column if not exists llm_model text;
alter table public.organizations add column if not exists llm_api_key text;
alter table public.organizations add column if not exists daily_quota_per_member int;
alter table public.organizations add column if not exists allowed_tools text[] default '{}'::text[];
alter table public.organizations add column if not exists tier text default 'solo';

-- ============ SKILL HUB (Enterprise) ============
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
create index if not exists org_agent_templates_org_idx on public.org_agent_templates(org_id);
alter table public.org_agent_templates add column if not exists share_token text unique;
alter table public.org_agent_templates add column if not exists visibility text default 'all';
alter table public.org_agent_templates add column if not exists auto_deploy boolean default false;
alter table public.org_agent_templates add column if not exists allowed_tools text[] default '{}'::text[];

-- ============ ENTERPRISE LEADS (inbound contact form) ============
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
create index if not exists enterprise_leads_created_at_idx on public.enterprise_leads(created_at desc);

create table if not exists public.org_members (
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text check (role in ('owner', 'manager', 'member')) default 'member',
  manager_id uuid references public.users(id) on delete set null,
  share_with_manager boolean default false,
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  email text not null,
  role text default 'member',
  manager_id uuid references public.users(id) on delete set null,
  token text unique not null,
  accepted boolean default false,
  created_at timestamptz default now()
);

-- Audit log: manager queries about members
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  target_id uuid references public.users(id) on delete set null,
  action text not null,
  question text,
  answer text,
  created_at timestamptz default now()
);
create index if not exists audit_log_target on public.audit_log(target_id, created_at desc);
create index if not exists audit_log_org on public.audit_log(org_id, created_at desc);

-- ============ RLS ============
alter table public.users enable row level security;
alter table public.google_tokens enable row level security;
alter table public.user_settings enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notes enable row level security;
alter table public.daily_reports enable row level security;
alter table public.usage_log enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.audit_log enable row level security;

-- Service role bypasses RLS; we use service role from server-only code.
-- For client access, all reads/writes go through server actions.
