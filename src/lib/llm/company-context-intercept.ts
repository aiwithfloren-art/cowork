import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateText } from "ai";
import { getLLMForUser } from "./providers";
import { loadPrimaryOrgContext, isOrgContextThin } from "@/lib/org-context";

/**
 * Just-in-time Company Context elicitation.
 *
 * Triggered in two cases:
 *   1. User asks for a brand-sensitive deliverable (PPT, proposal, pitch
 *      deck, landing page, marketing copy, caption, client email, one-pager)
 *      AND the org profile is thin (short description, no brand tone).
 *   2. User explicitly asks to save/set company context or brand tone.
 *
 * The intercept runs a short multi-turn Q&A (≤3 questions), parses the
 * answers via LLM, and upserts to the organizations table. After save the
 * user gets a confirmation and is told to re-state their original request —
 * auto-continuation is a follow-up.
 *
 * State carried across turns via a tag marker in the assistant message
 * (same pattern as the Agent Builder interceptor). The pending task from
 * the user's original message is embedded inside the tag so we can refer
 * back to it in the final confirmation.
 */

const CONTEXT_TAG = "🏢 Company Context:";

// Brand-sensitive intents — tasks whose output quality depends on tone /
// target customer / brand voice. Intentionally conservative: generic
// productivity intents (list tasks, summarize, schedule) are NOT here, so
// we don't nag the user for context they don't need.
const BRAND_TASK_PATTERN =
  /\b(ppt|powerpoint|slide|slides|deck|presentasi|presentation|proposal|penawaran|pitch|landing|website\s+copy|copywriting|caption|marketing|one[- ]?pager|company\s+profile|about\s+us|brosur|flyer|newsletter)\b/i;

const CLIENT_EMAIL_PATTERN =
  /\b(email|surat)\b[^.!?]{0,60}\b(ke|to|buat|for)\b[^.!?]{0,60}\b(client|customer|klien|prospect|prospek|lead|investor|partner|vendor)\b/i;

// Explicit "remember this context" intents — the user wants to update the
// profile without hitting /team.
const SAVE_CONTEXT_PATTERN =
  /\b(save|simpan|inget|remember|catet|update|set)\b[^.!?]{0,100}\b(company|perusahaan|brand|context|konteks|profil|profile|tone)\b/i;

type Msg = { role: "user" | "assistant"; content: string };

function isInContextFlow(history: Msg[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      return history[i].content.includes(CONTEXT_TAG);
    }
  }
  return false;
}

function extractPendingTask(history: Msg[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && m.content.includes(CONTEXT_TAG)) {
      // Primary: HTML comment (not visible in markdown render).
      const html = m.content.match(/<!--\s*pending::(.+?)::pending\s*-->/);
      if (html) return html[1];
      // Back-compat: old inline format if any lingering from prior turns.
      const inline = m.content.match(/\[pending::(.+?)::pending\]/);
      if (inline) return inline[1];
    }
  }
  return null;
}

function encodePending(task: string): string {
  // HTML comment — markdown renderer (react-markdown + remark-gfm) strips
  // comments from output, so the user sees a clean bubble while we still
  // carry the pending-task state across turns for the next intercept call.
  return `<!-- pending::${task.replace(/\n/g, " ").replace(/-->/g, "").slice(0, 500)}::pending -->`;
}

export async function tryInterceptCompanyContext(
  userId: string,
  message: string,
  history: Msg[],
): Promise<string | null> {
  const inFlow = isInContextFlow(history);
  const brandTask =
    BRAND_TASK_PATTERN.test(message) || CLIENT_EMAIL_PATTERN.test(message);
  const explicitSave = SAVE_CONTEXT_PATTERN.test(message);

  if (!inFlow && !brandTask && !explicitSave) return null;

  const current = await loadPrimaryOrgContext(userId);

  // Solo user with no org — we can't save anything meaningful. Skip and
  // let the normal chat flow handle the request as-is.
  if (!current) return null;

  // Brand task triggered but context already rich — let normal flow run.
  if (!inFlow && brandTask && !explicitSave && !isOrgContextThin(current)) {
    return null;
  }

  // Only owner/manager can write to the shared org profile. Match the gating
  // on /api/team/update-profile so rank-and-file members can't overwrite
  // company context via chat. Members still get a helpful message instead
  // of a silent fall-through so they know why their deliverable might feel
  // generic.
  const sbCheck = supabaseAdmin();
  const { data: membership } = await sbCheck
    .from("org_members")
    .select("role")
    .eq("org_id", current.orgId)
    .eq("user_id", userId)
    .maybeSingle();
  const canEdit = membership?.role === "owner" || membership?.role === "manager";
  if (!canEdit) {
    if (!brandTask && !explicitSave && !inFlow) return null;
    return [
      "Sigap belum tau soal perusahaan kamu, dan cuma owner/manager yang boleh isi profil company-nya.",
      "",
      "Dua opsi:",
      "- Minta owner/manager kamu isi di **/team** (Company profile card).",
      "- Atau lanjut aja — gue bakal coba ngerjain permintaan kamu dengan konteks yang ada, tapi hasilnya mungkin kerasa generic. Kalau gitu, coba ulang permintaan kamu.",
    ].join("\n");
  }

  // Pending task: the thing the user originally asked for. On a new trigger
  // we grab it from the current message; mid-flow we fish it out of the tag.
  const pending = inFlow
    ? extractPendingTask(history)
    : brandTask
      ? message.trim().slice(0, 500)
      : null;

  // Trimmed system prompt — the previous version blew past Groq's 8K TPM
  // free-tier limit on small orgs with many enabled tools. Keep it tight:
  // LLM only needs the CURRENT spec + the 3 fields + output schema.
  const systemPrompt = `Sigap Company Context Setup.${pending ? ` User is about to do: "${pending.slice(0, 200)}".` : ""}
Collect missing fields via SHORT Qs in user's language. Skip fields already set.

Fields: 1) description (product + target, 1-2 sentences), 2) brand_tone (short phrase), 3) websites (url or skip).

Current:
- Name: ${current.name || "?"}
- Description: ${current.description || "(empty)"}
- Tone: ${current.brandTone || "(empty)"}
- Websites: ${current.websites.join(", ") || "(empty)"}

Ask ONE Q at a time. Prefix with [Step N/3] based on missing count. Warm but terse — ONE sentence.
If user says skip/ga usah: move to save.
If user packs everything in one message: save immediately.

Output STRICT JSON only:
{"action":"ask","question":"<next Q>"}
OR
{"action":"save","spec":{"description":"<or null>","brand_tone":"<or null>","websites":[]}}`;

  // Feed the LLM only the portion of history that belongs to this flow
  // (so it doesn't get confused by earlier chat about other topics).
  // Cap at last 4 turns to stay within token budget on small Groq tier.
  const flowTurns: Msg[] = [];
  const MAX_FLOW_TURNS = 4;
  if (inFlow) {
    // Walk back from the latest until we find a non-flow assistant message
    // or run out. Include only in-flow turns.
    for (let i = history.length - 1; i >= 0 && flowTurns.length < MAX_FLOW_TURNS; i--) {
      const m = history[i];
      if (m.role === "assistant" && !m.content.includes(CONTEXT_TAG)) break;
      flowTurns.unshift(m);
    }
  }

  const llmMessages: Msg[] = [
    ...flowTurns,
    { role: "user", content: message },
  ];

  let planned: {
    action?: "ask" | "save";
    question?: string;
    spec?: {
      description?: string | null;
      brand_tone?: string | null;
      websites?: string[];
    };
  };

  try {
    const llm = await getLLMForUser(userId);
    const result = await generateText({
      model: llm.model,
      system: systemPrompt,
      messages: llmMessages,
    });
    const raw = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    try {
      planned = JSON.parse(raw);
    } catch {
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          planned = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        } catch {
          planned = { action: "ask", question: raw };
        }
      } else {
        planned = { action: "ask", question: raw };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return `${CONTEXT_TAG} Maaf, ada kendala teknis (${msg}). Lanjut tanpa setup dulu — permintaan kamu bakal tetap diproses, tapi mungkin kurang pas brand-nya.`;
  }

  if (planned.action === "ask") {
    const q =
      (planned.question ?? "").trim() ||
      "Cerita dikit dong: perusahaan kamu ngapain? (produk + target customer)";
    // HTML comment first (invisible), then the visible tag + question.
    const pendingMarker = pending ? `${encodePending(pending)}\n` : "";
    return `${pendingMarker}${CONTEXT_TAG} ${q}`;
  }

  if (planned.action !== "save" || !planned.spec) {
    return `${CONTEXT_TAG} Hmm, gue butuh info lebih. Cerita dong perusahaan kamu ngapain?`;
  }

  // Apply updates — null / missing means "keep existing".
  const update: {
    description?: string | null;
    brand_tone?: string | null;
    websites?: string[];
  } = {};
  const spec = planned.spec;

  if (typeof spec.description === "string" && spec.description.trim()) {
    update.description = spec.description.trim().slice(0, 2000);
  }
  if (typeof spec.brand_tone === "string" && spec.brand_tone.trim()) {
    update.brand_tone = spec.brand_tone.trim().slice(0, 300);
  }
  if (Array.isArray(spec.websites) && spec.websites.length > 0) {
    const cleaned = spec.websites
      .map((w) => w.trim())
      .filter(Boolean)
      .map((w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`))
      .slice(0, 10);
    if (cleaned.length > 0) update.websites = cleaned;
  }

  if (Object.keys(update).length === 0) {
    return `${CONTEXT_TAG} OK, skip setup dulu. Coba ulang permintaan kamu — gue bakal jalanin apa adanya.`;
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("organizations")
    .update(update)
    .eq("id", current.orgId);
  if (error) {
    return `⚠️ Gagal simpan context: ${error.message}`;
  }

  const summaryLines: string[] = ["✅ Company context saved:"];
  if (update.description) summaryLines.push(`- **About:** ${update.description}`);
  if (update.brand_tone) summaryLines.push(`- **Tone:** ${update.brand_tone}`);
  if (update.websites && update.websites.length > 0) {
    summaryLines.push(`- **Websites:** ${update.websites.join(", ")}`);
  }

  if (pending) {
    summaryLines.push(
      "",
      `Sekarang coba ulang permintaan kamu — "_${pending}_" — gue udah tau company kamu, jadi hasilnya bakal lebih pas.`,
    );
  } else {
    summaryLines.push("", "Bisa di-edit kapan aja di /team.");
  }

  return summaryLines.join("\n");
}
