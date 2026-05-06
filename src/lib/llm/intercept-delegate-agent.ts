/**
 * Server-side keyword routing for multi-agent delegation. When the user's
 * message clearly matches one specialist agent's domain, deterministically
 * route to that agent — bypass main LLM router. Cheaper + reliable.
 *
 * Pattern follows existing tryInterceptDelegation (which routes
 * human-to-human task delegation). Returns null when no clear match.
 *
 * Why server-side instead of LLM-side: even with strict prompt rules,
 * Flash Lite + gpt-4o-mini sometimes prefer web_search over
 * delegate_to_agent. Hardcoded keyword routing eliminates that variance.
 */

import { runSubAgent } from "@/lib/llm/run-sub-agent";

export type InterceptedDelegation = {
  agent_name: string;
  reply: string;
  tools_called: string[];
  cost_usd: number;
};

const PATTERNS: Array<{ agent: string; regex: RegExp }> = [
  // Lead Gen — search for businesses/prospects
  {
    agent: "Lead Gen",
    regex:
      /\b(cari(?:in|kan)?|find|list|cariin)\b.*\b(cafe|coffee|restaurant|restoran|toko|shop|salon|barber|barbershop|clinic|klinik|gym|studio|photographer|fotografer|agency|saas|prospect|prospek|leads?|cafe|warung|kedai|kos|hotel|villa|spa|bookstore|boutique|clothing|fashion)\b/i,
  },
  // Content Creator — make IG/social content
  {
    agent: "Content Creator",
    regex:
      /\b(bikin(?:in|kan)?|buatin|buatkan|draft|create|make)\b.*\b(carousel|caption|post|content|konten|ig|instagram|tiktok|social media|sosmed|slide)\b/i,
  },
  // Coder — build website / app / code
  {
    agent: "Coder",
    regex:
      /\b(bikin(?:in|kan)?|buatin|build|deploy|create|make)\b.*\b(landing\s*page|website|web|app|aplikasi|component|komponen|html|react|next.?js|deploy|live|publish)\b/i,
  },
];

export async function tryInterceptAgentDelegation(args: {
  userId: string;
  message: string;
}): Promise<InterceptedDelegation | null> {
  const { userId, message } = args;
  // Only intercept reasonably short messages — long compound requests
  // (multi-part) are better handled by LLM router which can sequence
  // multiple delegations.
  if (message.length > 200) return null;

  // CREATE-AGENT GUARD — if the user is asking to BUILD a new agent
  // (not run an existing one), skip specialist routing so the main
  // LLM gets to call create_ai_employee. Without this, messages like
  // "buatkan aku agent baru buat ... carousel post" mis-route to the
  // Content Creator agent (matches "buatkan ... post" in its regex)
  // when intent is clearly to create a NEW agent, not run one.
  const lower = message.toLowerCase();
  const hasAgentWord = /\b(agent|asisten|asistan|ai\s*employee|specialist)\b/i.test(
    message,
  );
  const hasCreateWord =
    /\b(bikin|bikinin|buatin|buatkan|buat|create|make|new|tambah(in|an)?|setup)\b/i.test(
      message,
    );
  const hasNewMarker = /\b(baru|new|tambahan|fresh)\b/i.test(message);

  if (hasAgentWord && (hasCreateWord || hasNewMarker)) {
    console.log(
      "[agent-delegation] CREATE_AGENT guard fired — routing to main LLM:",
      lower.slice(0, 80),
    );
    return null;
  }

  for (const { agent, regex } of PATTERNS) {
    if (regex.test(message)) {
      const result = await runSubAgent({
        userId,
        agentName: agent,
        task: message,
      });
      if (!result.ok) {
        // Fall through to LLM router on sub-agent failure (e.g. agent
        // not installed). Return null so caller proceeds with normal flow.
        return null;
      }
      // Prepend an "auto-routed" badge so user learns the mental model:
      // their request was handled by a specialist agent. Builds trust +
      // discoverability for the multi-agent flow.
      const badge = AGENT_BADGES[agent] ?? `🤖 ${agent}`;
      const replyWithBadge = `${badge}\n\n${result.reply}`;
      return {
        agent_name: result.agent_name,
        reply: replyWithBadge,
        tools_called: result.tools_called,
        cost_usd: result.cost_usd,
      };
    }
  }

  return null;
}

const AGENT_BADGES: Record<string, string> = {
  "Lead Gen": "🎯 _Auto-routed to **Lead Gen** agent_",
  "Content Creator": "🎨 _Auto-routed to **Content Creator** agent_",
  "Coder": "💻 _Auto-routed to **Coder** agent_",
};
