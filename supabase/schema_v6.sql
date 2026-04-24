-- ============ FULL GROQ RETIREMENT (v6) ============
-- Groq is fully removed from the runtime code path. This migration updates
-- the organizations.llm_provider default + any existing rows that were
-- auto-seeded with 'groq' so they fall into the now-canonical 'openrouter'
-- bucket. Rows where an org admin explicitly set openai/anthropic/etc
-- are left alone.

alter table public.organizations
  alter column llm_provider set default 'openrouter';

update public.organizations
  set llm_provider = 'openrouter'
  where llm_provider = 'groq'
    or llm_provider is null;
