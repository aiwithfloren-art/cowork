-- v7: Agent Assignments
--
-- Owner / manager push-assigns published org templates to specific employees.
-- Differs from current self-install ("publish + member installs") flow:
--   - Direction: push (admin assigns) vs pull (member installs)
--   - Mandatory: only admin can unassign (employee can't self-remove)
--   - Audit: every assign / unassign tracked with actor + timestamp + note
--
-- Operational shape:
--   When admin assigns template → row inserted in agent_assignments AND
--   the template is cloned into employee's custom_agents (so existing chat
--   / runner infrastructure works without changes). The cloned row is
--   marked with `assigned_by_admin = true` so DELETE is blocked client-
--   and server-side. On unassign → cloned custom_agent deleted, assignment
--   row marked status='removed'.

create table if not exists public.agent_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade not null,
  template_id uuid references public.org_agent_templates(id) on delete cascade not null,
  assigned_to_user_id uuid references public.users(id) on delete cascade not null,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  assignment_note text,
  status text not null default 'active' check (status in ('active', 'removed', 'paused')),
  cloned_agent_slug text,  -- slug of the row in custom_agents that was cloned
  assigned_at timestamptz default now(),
  removed_at timestamptz
);

create index if not exists agent_assignments_org_idx on public.agent_assignments(org_id);
create index if not exists agent_assignments_user_idx on public.agent_assignments(assigned_to_user_id) where status = 'active';
create index if not exists agent_assignments_template_idx on public.agent_assignments(template_id);
create unique index if not exists agent_assignments_unique_active
  on public.agent_assignments(template_id, assigned_to_user_id)
  where status = 'active';

alter table public.agent_assignments enable row level security;

-- Members can read their own active assignments (employee view).
create policy "members read own assignments" on public.agent_assignments
  for select using (assigned_to_user_id = auth.uid());

-- Owner / manager of the org can read all assignments in their org.
create policy "admins read org assignments" on public.agent_assignments
  for select using (
    org_id in (
      select org_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'manager')
    )
  );

-- Service-role bypass policies live at the API layer (we use supabaseAdmin()
-- there). Owners/managers cannot modify rows directly via PostgREST.

-- Add a flag to custom_agents so we can block employee self-delete on
-- assigned clones. Optional column — code falls back gracefully if
-- the column doesn't exist (older schemas).
alter table public.custom_agents
  add column if not exists assigned_by_admin boolean not null default false;
alter table public.custom_agents
  add column if not exists source_template_id uuid references public.org_agent_templates(id) on delete set null;
