-- ============ BACKGROUND CHECKS (v4) ============
-- Queue for long-running status polls the agent can't finish inside a
-- single chat turn (Vercel deploys, Netlify builds, etc). A 1-minute
-- cron sweeps pending rows, polls the upstream status endpoint, and
-- on a terminal state (READY/ERROR/CANCELED) inserts a notification
-- + pushes a Slack DM to the user.

create table if not exists public.background_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  kind text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  last_state text,
  result jsonb,
  attempts int not null default 0,
  max_attempts int not null default 30,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists background_checks_pending
  on public.background_checks(status, updated_at)
  where status = 'pending';
create index if not exists background_checks_user_recent
  on public.background_checks(user_id, created_at desc);

alter table public.background_checks enable row level security;

create policy "bgcheck_own_rows" on public.background_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
