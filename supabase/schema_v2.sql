-- Cowork schema v2: Tier 3 features
-- Run after the initial schema.sql

-- ============ TELEGRAM LINKING ============
create table if not exists public.telegram_links (
  user_id uuid primary key references public.users(id) on delete cascade,
  telegram_user_id bigint unique not null,
  telegram_username text,
  linked_at timestamptz default now()
);
create index if not exists telegram_links_tg_id on public.telegram_links(telegram_user_id);

create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- ============ WEEKLY REPORTS ============
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  week_start date not null,
  content text,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

-- ============ EMAIL SEND LOG ============
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  subject text,
  provider_id text,
  status text,
  created_at timestamptz default now()
);

-- ============ MEETING BOTS (Recall.ai) ============
create table if not exists public.meeting_bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  bot_id text not null unique,
  meeting_url text,
  status text default 'joining',
  transcript text,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_meeting_bots_user on public.meeting_bots(user_id, created_at desc);

-- RLS
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.email_log enable row level security;
alter table public.meeting_bots enable row level security;
