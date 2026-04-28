/**
 * Post-LLM response validator. Detects when a small/cheap model hallucinates
 * tool results — the most common failure mode is the agent quoting a URL
 * that was never actually returned by a tool (e.g. claiming a carousel
 * slide URL that doesn't exist in storage).
 *
 * Strategy: scan the assistant's final text for Sigap storage URLs +
 * generated image URLs, cross-check against URLs that actually appeared in
 * tool results from this turn. If text URL ≠ any tool-result URL, replace
 * (auto-correct) when possible OR return an error notice when not.
 *
 * This makes Sigap resilient to dumb-model hallucinations without changing
 * the model itself. Quality of caption / content stays as-is (still subject
 * to model limits) — only fake URLs get caught.
 */

export type ValidationStep = {
  toolCalls?: Array<{ toolName?: string }>;
  toolResults?: Array<{
    toolName?: string;
    result?: unknown;
    output?: unknown;
  }>;
  content?: Array<{ type?: string; result?: unknown; output?: unknown }>;
};

export type ValidationOutcome = {
  text: string;
  changed: boolean;
  hallucinated_urls: string[];
  notes: string[];
};

// URL patterns we care about: Sigap storage (carousel slides, generated
// images) and any *.supabase.co/storage public URL the agent might cite.
const STORAGE_URL_REGEX =
  /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg|webp|gif)/g;

export function validateAssistantResponse(args: {
  text: string;
  steps: ValidationStep[] | undefined;
}): ValidationOutcome {
  const text = args.text;
  const steps = args.steps ?? [];

  const claimedUrls = Array.from(
    new Set(text.match(STORAGE_URL_REGEX) ?? []),
  );

  if (claimedUrls.length === 0) {
    return { text, changed: false, hallucinated_urls: [], notes: [] };
  }

  const toolResultUrls = collectToolResultUrls(steps);

  const realSet = new Set(toolResultUrls);
  const hallucinated = claimedUrls.filter((u) => !realSet.has(u));

  if (hallucinated.length === 0) {
    return { text, changed: false, hallucinated_urls: [], notes: [] };
  }

  // Auto-correct path: if real URLs exist in tool results, swap them in
  // using the order they appear (slide-1 → first real URL, slide-2 →
  // second, etc). Position-based mapping is good enough for carousel
  // because tool returns urls[] in slide order.
  if (toolResultUrls.length > 0) {
    let corrected = text;
    const notes: string[] = [];
    let realIdx = 0;
    for (const fake of hallucinated) {
      const real = toolResultUrls[realIdx];
      if (real) {
        corrected = corrected.split(fake).join(real);
        notes.push(`Replaced hallucinated URL with real one (position ${realIdx + 1})`);
        realIdx++;
      } else {
        // No more real URLs to map — strip the fake URL line entirely
        corrected = corrected.replace(
          new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegex(fake)}\\)\\s*\\n?`, "g"),
          "",
        );
        corrected = corrected.split(fake).join("");
        notes.push("Stripped extra hallucinated URL (no real URL to map)");
      }
    }
    return {
      text: corrected,
      changed: true,
      hallucinated_urls: hallucinated,
      notes,
    };
  }

  // No real URLs at all in tool results — agent skipped tool entirely.
  // Replace text with an honest error so user sees the actual state.
  return {
    text:
      "⚠️ Aku coba bikin file/gambar tapi tool-nya gak ke-call dengan benar (kemungkinan halusinasi model). Coba ulang request kamu — kalau ulang masih sama, mungkin perlu spesifikkan request-nya.",
    changed: true,
    hallucinated_urls: hallucinated,
    notes: ["Agent claimed URLs but no tool returned any URL — full-rewrite to honest error"],
  };
}

function collectToolResultUrls(steps: ValidationStep[]): string[] {
  const urls = new Set<string>();
  for (const step of steps) {
    for (const tr of step.toolResults ?? []) {
      addUrlsFromValue(tr.result, urls);
      addUrlsFromValue(tr.output, urls);
    }
    for (const c of step.content ?? []) {
      if (c?.type === "tool-result") {
        addUrlsFromValue(c.result, urls);
        addUrlsFromValue(c.output, urls);
      }
    }
  }
  return [...urls];
}

function addUrlsFromValue(value: unknown, sink: Set<string>): void {
  if (!value) return;
  if (typeof value === "string") {
    const matches = value.match(STORAGE_URL_REGEX);
    if (matches) for (const m of matches) sink.add(m);
    return;
  }
  if (typeof value === "object") {
    // Stringify safely so we catch URLs nested inside arrays/objects
    // without writing custom recursion for every shape.
    try {
      const json = JSON.stringify(value);
      const matches = json.match(STORAGE_URL_REGEX);
      if (matches) for (const m of matches) sink.add(m);
    } catch {
      // Circular ref or unserialisable — skip
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
