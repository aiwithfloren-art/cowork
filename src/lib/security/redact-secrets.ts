/**
 * Best-effort secret redaction for chat message text before it lands in
 * the DB. Goal: if a user (or agent) pastes a known-format API token into
 * chat, the raw token should NOT be stored in chat_messages — only
 * in the purpose-built connectors table.
 *
 * Strategy: known-prefix regex (cheap + accurate) + an exact-string pass
 * over tokens we observed the LLM passing to save_credential in this
 * turn. The second pass catches prefix-less tokens (Vercel, Airtable)
 * where pattern detection would false-positive on random IDs.
 *
 * Not a substitute for transport-layer protection — users who explicitly
 * paste tokens in public channels still need to delete those channel
 * messages themselves. This just ensures our own DB doesn't retain them.
 */

type Pattern = { name: string; regex: RegExp };

// Order matters only for telemetry (first-match-wins reporting), not
// correctness — replacements are idempotent because [redacted] doesn't
// match any of these patterns.
const PATTERNS: Pattern[] = [
  { name: "openai_sk", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "anthropic_sk", regex: /\bsk-ant-api[0-9]{2}-[A-Za-z0-9_-]{32,}\b/g },
  {
    name: "github_pat",
    regex:
      /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  },
  { name: "stripe_key", regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  { name: "linear_api", regex: /\blin_api_[A-Za-z0-9]{24,}\b/g },
  { name: "slack_xox", regex: /\bxox[abpos]-[A-Za-z0-9-]{10,}\b/g },
  { name: "google_api", regex: /\bAIza[0-9A-Za-z_-]{35,}\b/g },
  {
    name: "jwt",
    regex:
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  { name: "composio_platform", regex: /\bak_[A-Za-z0-9]{20,}\b/g },
  { name: "composio_auth", regex: /\bac_[A-Za-z0-9]{12,}\b/g },
  // Supabase service role / anon JWT caught by JWT pattern above
];

const REDACTED = "[redacted]";

export type RedactResult = {
  redacted: string;
  hadSecret: boolean;
  patternsHit: string[];
};

/**
 * Pattern-based redaction for known token prefixes.
 */
export function redactByPatterns(text: string): RedactResult {
  if (!text) return { redacted: text, hadSecret: false, patternsHit: [] };
  let out = text;
  const hit: string[] = [];
  for (const { name, regex } of PATTERNS) {
    // Reset state for global regex reuse
    regex.lastIndex = 0;
    if (regex.test(out)) {
      regex.lastIndex = 0;
      out = out.replace(regex, REDACTED);
      hit.push(name);
    }
  }
  return { redacted: out, hadSecret: hit.length > 0, patternsHit: hit };
}

/**
 * Exact-string redaction over a list of known secrets we want scrubbed.
 * Short strings (< 8 chars) skipped to avoid mangling normal words.
 */
export function redactByExact(text: string, secrets: string[]): string {
  if (!text || secrets.length === 0) return text;
  let out = text;
  for (const s of secrets) {
    const trimmed = s.trim();
    if (trimmed.length < 8) continue;
    out = out.split(trimmed).join(REDACTED);
  }
  return out;
}

/**
 * Combined pass: pattern-based first (catches anything with a known
 * prefix), then exact-match against tokens the LLM explicitly saved
 * this turn (catches prefix-less ones like Vercel/Airtable tokens).
 */
export function redactSecrets(
  text: string,
  observedTokens: string[] = [],
): RedactResult {
  const pass1 = redactByPatterns(text);
  const out = redactByExact(pass1.redacted, observedTokens);
  return {
    redacted: out,
    hadSecret: pass1.hadSecret || out.includes(REDACTED),
    patternsHit: pass1.patternsHit,
  };
}

/**
 * Pulls tokens out of an ai-sdk generateText result by scanning for
 * save_credential tool calls. Returns the raw `token` arg for each call
 * so the chat route can redact those exact values before persisting.
 */
export function extractSavedTokens(
  steps:
    | Array<{
        toolCalls?: Array<{
          toolName?: string;
          input?: unknown;
        }>;
      }>
    | undefined,
): string[] {
  if (!steps) return [];
  const out: string[] = [];
  for (const step of steps) {
    for (const tc of step.toolCalls ?? []) {
      if (tc.toolName === "save_credential" && tc.input) {
        const input = tc.input as { token?: unknown };
        if (typeof input.token === "string" && input.token.length >= 8) {
          out.push(input.token);
        }
      }
    }
  }
  return out;
}
