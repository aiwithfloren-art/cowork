/**
 * Proactive Content Creator: generates a content draft for one user.
 *
 * Flow per user (called from cron):
 *   1. Read agent_user_config (niche, tone, voice, audience, language)
 *   2. Pick a topic seed from niche (LLM-driven)
 *   3. Brave Search for fresh angle (if quota allows + key configured;
 *      else fall back to prompt-only)
 *   4. Generate caption + hashtags + carousel slide spec
 *   5. Save as note (type='general', content prefixed with [CONTENT_DRAFT])
 *
 * The draft is text-only at this stage. PNG render is deferred — user
 * triggers render on-demand via reactive Content Creator chat.
 *
 * MOCKING: any call site using BRAVE_SEARCH_MOCK=1 will get canned search
 * results. LLM call is real — but in dev, OPENROUTER_API_KEY is disabled
 * so the call fails fast with a clear error (this is intended; cron
 * should never run in local dev anyway).
 */

import { generateText } from "ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentConfig } from "@/lib/agent-config";
import { getLLMForAgent } from "@/lib/llm/providers";
import { braveSearch } from "@/lib/web/brave";
import {
  tryConsumeBraveQuota,
  type RateLimitOutcome,
} from "@/lib/proactive/rate-limit";

export const PROACTIVE_AGENT_NAME = "Content Creator";

export type ProactiveDraftResult = {
  ok: boolean;
  user_id: string;
  topic?: string;
  search_used: boolean;
  search_status: "used" | "skipped_no_key" | "skipped_rate_limit" | "failed";
  note_id?: string;
  error?: string;
};

type Config = {
  niche?: string;
  brand_tone?: string;
  brand_voice?: string;
  target_audience?: string;
  language?: string;
};

export async function generateProactiveDraft(args: {
  userId: string;
  orgId: string | null;
}): Promise<ProactiveDraftResult> {
  const { userId, orgId } = args;

  try {
    const cfg = await getAgentConfig(userId, PROACTIVE_AGENT_NAME);
    const config = cfg.config as Config;

    const niche = config.niche || "general";
    const tone = config.brand_tone || "casual";
    const voice = config.brand_voice || "friendly";
    const audience = config.target_audience || "general";
    const language = config.language || "ID";

    // ---- Step 1: research (best-effort) ----
    const research = await maybeBraveSearch({
      query: `${niche} trending content ideas this week`,
      orgId,
    });

    // ---- Step 2: generate draft via LLM ----
    const { model } = await getLLMForAgent(userId, {
      llm_override_provider: "openrouter",
      llm_override_model: "anthropic/claude-haiku-4.5",
    });

    const systemPrompt = buildSystemPrompt({ niche, tone, voice, audience, language });
    const userPrompt = buildUserPrompt({
      niche,
      researchSnippets: research.snippets,
      researchUsed: research.outcome.search_used,
    });

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const parsed = parseDraftJson(text);
    if (!parsed) {
      return {
        ok: false,
        user_id: userId,
        search_used: research.outcome.search_used,
        search_status: research.outcome.search_status,
        error: "LLM returned non-JSON or malformed JSON draft",
      };
    }

    // ---- Step 3: persist as note ----
    const noteContent = buildNoteContent({
      topic: parsed.topic,
      caption: parsed.caption,
      hashtags: parsed.hashtags,
      slideSpec: parsed.slide_spec,
      searchUsed: research.outcome.search_used,
      searchStatus: research.outcome.search_status,
    });

    const sb = supabaseAdmin();
    const { data: note, error: insertErr } = await sb
      .from("notes")
      .insert({
        user_id: userId,
        content: noteContent,
        type: "general",
        visibility: "private",
      })
      .select("id")
      .maybeSingle();
    if (insertErr) throw insertErr;

    return {
      ok: true,
      user_id: userId,
      topic: parsed.topic,
      search_used: research.outcome.search_used,
      search_status: research.outcome.search_status,
      note_id: note?.id as string | undefined,
    };
  } catch (e) {
    return {
      ok: false,
      user_id: userId,
      search_used: false,
      search_status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------- helpers ----------------

type ResearchOutcome = {
  search_used: boolean;
  search_status: ProactiveDraftResult["search_status"];
};

async function maybeBraveSearch(args: {
  query: string;
  orgId: string | null;
}): Promise<{ snippets: string; outcome: ResearchOutcome }> {
  if (!process.env.BRAVE_SEARCH_API_KEY && process.env.BRAVE_SEARCH_MOCK !== "1") {
    return {
      snippets: "",
      outcome: { search_used: false, search_status: "skipped_no_key" },
    };
  }

  const limit: RateLimitOutcome = await tryConsumeBraveQuota(args.orgId);
  if (!limit.allowed) {
    return {
      snippets: "",
      outcome: { search_used: false, search_status: "skipped_rate_limit" },
    };
  }

  try {
    const result = await braveSearch({ query: args.query, count: 5 });
    const snippets = result.results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title} — ${r.description}`)
      .join("\n");
    return {
      snippets,
      outcome: { search_used: true, search_status: "used" },
    };
  } catch (e) {
    console.warn(
      "[proactive-content] Brave Search failed, continuing prompt-only:",
      e instanceof Error ? e.message : e,
    );
    return {
      snippets: "",
      outcome: { search_used: false, search_status: "failed" },
    };
  }
}

function buildSystemPrompt(p: {
  niche: string;
  tone: string;
  voice: string;
  audience: string;
  language: string;
}): string {
  return [
    "You are Content Creator agent running in PROACTIVE mode.",
    `Brand context: niche=${p.niche}, tone=${p.tone}, voice=${p.voice}, audience=${p.audience}, language=${p.language}.`,
    "",
    "Generate ONE carousel post draft. Output STRICT JSON only — no markdown, no commentary, no code fences. Schema:",
    "{",
    '  "topic": string (5-8 words),',
    '  "caption": string (80-150 words, match tone+voice+language),',
    '  "hashtags": string[] (8-15 items, mix of popular + niche-specific + branded),',
    '  "slide_spec": [{',
    '    "background": string (hex like "#1a1a1a" OR CSS gradient),',
    '    "text_color": string (default "#FFFFFF"),',
    '    "elements": [',
    '      { "type": "heading"|"subheading"|"body"|"badge"|"spacer", ... }',
    "    ]",
    "  }] (4-6 slides total)",
    "}",
    "",
    "Slide structure: Slide 1 = hook, middle slides = 2-4 main points, last slide = CTA.",
    "Tone-to-background mapping: casual=pastel gradient, professional=dark solid, playful=bright gradient, bold=high-contrast solid.",
  ].join("\n");
}

function buildUserPrompt(p: {
  niche: string;
  researchSnippets: string;
  researchUsed: boolean;
}): string {
  const research = p.researchUsed
    ? `\n\nFresh research snippets (use sparingly, do not copy verbatim):\n${p.researchSnippets}\n`
    : "";
  return [
    `Today's task: pick ONE engaging topic in the "${p.niche}" niche and produce the full draft JSON.`,
    "Pick a topic that feels timely or evergreen-useful — not generic. Avoid repeating typical advice everyone has seen.",
    research,
    "Output JSON only. Start your response with `{` and end with `}`. Nothing else.",
  ].join("\n");
}

function parseDraftJson(text: string): {
  topic: string;
  caption: string;
  hashtags: string[];
  slide_spec: unknown;
} | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    if (
      typeof obj.topic !== "string" ||
      typeof obj.caption !== "string" ||
      !Array.isArray(obj.hashtags) ||
      !Array.isArray(obj.slide_spec)
    ) {
      return null;
    }
    return {
      topic: obj.topic,
      caption: obj.caption,
      hashtags: (obj.hashtags as unknown[]).map(String),
      slide_spec: obj.slide_spec,
    };
  } catch {
    return null;
  }
}

function buildNoteContent(p: {
  topic: string;
  caption: string;
  hashtags: string[];
  slideSpec: unknown;
  searchUsed: boolean;
  searchStatus: string;
}): string {
  const meta = {
    kind: "content_draft",
    topic: p.topic,
    caption: p.caption,
    hashtags: p.hashtags,
    slide_spec: p.slideSpec,
    generated_at: new Date().toISOString(),
    search_used: p.searchUsed,
    search_status: p.searchStatus,
    status: "draft",
  };
  return `[CONTENT_DRAFT ${meta.generated_at}]\n${JSON.stringify(meta, null, 2)}`;
}

// ---- frequency / hour matching (used by cron route) ----

export function userQualifiesNow(args: {
  proactiveMode: string | undefined;
  frequency: string | undefined;
  preferredHour: number | undefined;
  nowJakarta: { hour: number; dayOfWeek: number };
}): boolean {
  if (args.proactiveMode !== "proactive") return false;

  if (args.preferredHour === undefined || args.preferredHour < 0 || args.preferredHour > 23) {
    return false;
  }
  if (args.preferredHour !== args.nowJakarta.hour) return false;

  const day = args.nowJakarta.dayOfWeek; // 0=Sun, 1=Mon, ..., 6=Sat

  switch (args.frequency) {
    case "daily":
      return true;
    case "3x_week":
      // Hardcoded Mon-Wed-Fri per M4 plan
      return day === 1 || day === 3 || day === 5;
    case "weekly":
      // Hardcoded Monday per M4 plan
      return day === 1;
    default:
      return false;
  }
}

/**
 * Compute current Jakarta time (UTC+7, no DST). Used to match
 * preferred_hour stored in user config. We don't use Intl.DateTimeFormat
 * at runtime because Vercel edge timezone DB can be inconsistent — manual
 * offset is more predictable for a single timezone.
 */
export function nowInJakarta(now: Date = new Date()): {
  hour: number;
  dayOfWeek: number;
} {
  const jakartaMs = now.getTime() + 7 * 60 * 60 * 1000;
  const j = new Date(jakartaMs);
  return {
    hour: j.getUTCHours(),
    dayOfWeek: j.getUTCDay(),
  };
}
