-- Cowork schema v3: Artifacts (Claude-Artifacts-style deliverables)
-- Every drafted deliverable lives as its own row, gets a permanent URL,
-- and is rendered in /artifacts/[id] with Copy/Edit/Delete actions.
-- Run after schema.sql and schema_v2.sql in Supabase SQL Editor.

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  agent_id uuid,  -- references custom_agents(id); soft ref, agent may be deleted
  type text not null check (type in ('post', 'email', 'proposal', 'caption', 'document')),
  platform text,  -- 'instagram', 'linkedin', 'twitter', 'whatsapp', 'facebook', 'tiktok', 'email' — optional
  title text not null,
  body_markdown text not null default '',
  meta jsonb not null default '{}'::jsonb,  -- flexible: {subject, recipient, hashtags, client, cta}
  thumbnail_url text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists artifacts_user_created on public.artifacts(user_id, created_at desc);
create index if not exists artifacts_user_type on public.artifacts(user_id, type);
create index if not exists artifacts_status on public.artifacts(user_id, status) where status != 'archived';

alter table public.artifacts enable row level security;
