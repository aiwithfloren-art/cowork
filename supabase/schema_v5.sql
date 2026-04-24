-- ============ DROP BYOK GROQ KEY (v5) ============
-- Personal per-user Groq keys (user_settings.groq_key) are retired. The
-- platform now resolves every user to OpenRouter + Gemini 2.5 Flash so
-- nobody hits Groq's 8K TPM free-tier ceiling on tool-heavy multi-step
-- turns (Calendar + Gmail was requesting ~21K tokens). See
-- src/lib/llm/providers.ts resolveLLMFor() for the new priority.

alter table public.user_settings drop column if exists groq_key;
