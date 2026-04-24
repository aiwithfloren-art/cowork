import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { generateText, stepCountIs } from "ai";
import { getLLMForAgent, estimateCost } from "@/lib/llm/providers";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { tryInterceptDelegation } from "@/lib/llm/delegate-intercept";
import { tryInterceptMeetingRecord, tryInterceptMeetingSummary } from "@/lib/llm/meeting-intercept";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";
import { redactSecrets, extractSavedTokens } from "@/lib/security/redact-secrets";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Slack Events API webhook. When a user DMs the Sigap bot in Slack,
 * or @-mentions it in a channel, we route the message to the user's
 * Sigap agent and reply in Slack using the connector's bot token.
 *
 * Setup in Slack app settings:
 *   1. Event Subscriptions → Enable → Request URL: this route
 *   2. Subscribe to bot events: app_mention, message.im
 *   3. Reinstall to workspace
 */
type SlackEvent = {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  bot_id?: string;
  subtype?: string;
};

type SlackEventPayload = {
  type: "url_verification" | "event_callback";
  challenge?: string;
  team_id?: string;
  event?: SlackEvent;
};

function verifySignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string,
): boolean {
  if (!timestamp || !signature) return false;
  // Reject old requests (>5 min) to prevent replay
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (age > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (signingSecret) {
    const ok = verifySignature(
      rawBody,
      req.headers.get("x-slack-request-timestamp"),
      req.headers.get("x-slack-signature"),
      signingSecret,
    );
    if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const payload = JSON.parse(rawBody) as SlackEventPayload;

  // URL verification handshake when configuring the webhook
  if (payload.type === "url_verification" && payload.challenge) {
    return new NextResponse(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Slack retries any event it doesn't get a 200 for within 3s. Our handler
  // takes longer (Groq + tools), so without this guard a single user message
  // would be processed up to 3x in parallel, producing duplicate replies.
  if (req.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true });
  }

  if (payload.type !== "event_callback" || !payload.event) {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;
  // Ignore bot messages and non-message events
  if (
    event.bot_id ||
    event.subtype === "bot_message" ||
    (event.type !== "app_mention" && event.type !== "message")
  ) {
    return NextResponse.json({ ok: true });
  }
  // For channel messages, only respond to @mentions (not every message)
  if (event.type === "message" && !event.channel?.startsWith("D")) {
    return NextResponse.json({ ok: true });
  }
  if (!event.text || !event.user || !event.channel) {
    return NextResponse.json({ ok: true });
  }

  const cleanText = event.text.replace(/^<@[A-Z0-9]+>\s*/, "").trim();
  if (!cleanText) return NextResponse.json({ ok: true });

  const channel = event.channel;
  const slackUserId = event.user;
  const teamId = payload.team_id ?? "";

  // Ack Slack immediately so it doesn't retry. Heavy work runs after the response.
  after(() => processSlackMessage({ teamId, slackUserId, channel, cleanText }));

  return NextResponse.json({ ok: true });
}

async function processSlackMessage(args: {
  teamId: string;
  slackUserId: string;
  channel: string;
  cleanText: string;
}) {
  const { teamId, slackUserId, channel, cleanText } = args;
  const sb = supabaseAdmin();

  const { data: connector } = await sb
    .from("connectors")
    .select("user_id, access_token, external_account_id")
    .eq("provider", "slack")
    .eq("external_account_id", teamId)
    .maybeSingle();

  if (!connector) {
    // Extremely rare — should have been filtered upstream, but handle
    // defensively so signature + handshake don't break.
    console.error("slack event: no connector for team_id", teamId);
    return;
  }

  const profileRes = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    { headers: { Authorization: `Bearer ${connector.access_token}` } },
  );
  const profile = (await profileRes.json()) as {
    ok: boolean;
    error?: string;
    user?: { profile?: { email?: string } };
  };

  // Failure mode A: Slack API rejected our users.info call (bad token,
  // missing scope, user revoked, workspace removed). Tell the user what
  // happened so they can fix it — silent return leaves them confused.
  if (!profile.ok) {
    const slackErr = profile.error ?? "unknown_error";
    const hint =
      slackErr === "missing_scope"
        ? `Reconnect Slack — scope 'users:read.email' belum granted. Buka ${getAppUrl()}/settings/connectors → disconnect Slack → Connect lagi.`
        : slackErr === "user_not_found"
          ? "Akun Slack lo ga ke-resolve di workspace ini. Coba reconnect Slack."
          : "Slack API error — kemungkinan token kadaluarsa. Reconnect Slack di /settings/connectors.";
    await postSlack(
      connector.access_token,
      channel,
      `⚠️ Slack auth issue (${slackErr}). ${hint}`,
    );
    return;
  }

  const slackEmail = profile.user?.profile?.email;
  // Failure mode B: call succeeded but email field empty — almost always
  // means users:read.email scope is missing despite users:read working.
  // Slack sometimes strips email even on 'ok: true' responses.
  if (!slackEmail) {
    await postSlack(
      connector.access_token,
      channel,
      "⚠️ Sigap ga bisa baca email Slack lo. Scope 'users:read.email' perlu di-grant. Reconnect Slack: disconnect di /settings/connectors → Connect lagi → Authorize.",
    );
    return;
  }

  const { data: sigapUser } = await sb
    .from("users")
    .select("id, email")
    .eq("email", slackEmail)
    .maybeSingle();

  // Failure mode C: Slack email doesn't match any Sigap account — user
  // logged into Sigap with a different email than the one on their
  // Slack workspace.
  if (!sigapUser) {
    await postSlack(
      connector.access_token,
      channel,
      `Hi! Email Slack lo (${slackEmail}) ga match sama Sigap account. Sign in ke ${getAppUrl()} pake email yang sama (${slackEmail}), atau login ke Sigap dulu.`,
    );
    return;
  }

  const rl = await checkRateLimit(sigapUser.id);
  if (!rl.ok) {
    await postSlack(connector.access_token, channel, `⚠️ ${rl.message}`);
    return;
  }

  // Pull last few assistant/user messages so the multi-turn agent builder
  // can track whether it's mid-conversation.
  // Agent create/edit/delete are now LLM tools (create_ai_employee /
  // edit_ai_employee / delete_agent) — see chat route for rationale. The
  // main LLM below handles any phrasing naturally via those tools.

  const summaryMsg = await tryInterceptMeetingSummary(sigapUser.id, cleanText);
  if (summaryMsg) {
    await sb.from("chat_messages").insert([
      { user_id: sigapUser.id, role: "user", content: cleanText },
      { user_id: sigapUser.id, role: "assistant", content: summaryMsg },
    ]);
    await postSlack(connector.access_token, channel, summaryMsg);
    return;
  }

  const meeting = await tryInterceptMeetingRecord(sigapUser.id, cleanText);
  if (meeting) {
    await sb.from("chat_messages").insert([
      { user_id: sigapUser.id, role: "user", content: cleanText },
      { user_id: sigapUser.id, role: "assistant", content: meeting },
    ]);
    await postSlack(connector.access_token, channel, meeting);
    return;
  }

  const delegation = await tryInterceptDelegation(sigapUser.id, cleanText);
  if (delegation) {
    await sb.from("chat_messages").insert([
      { user_id: sigapUser.id, role: "user", content: cleanText },
      { user_id: sigapUser.id, role: "assistant", content: delegation },
    ]);
    await postSlack(connector.access_token, channel, delegation);
    return;
  }

  try {
    console.log(
      `[slack] user=${sigapUser.email} text="${cleanText.slice(0, 100)}"`,
    );
    const allTools = await buildToolsForUser(sigapUser.id);
    console.log(`[slack] tools loaded: ${Object.keys(allTools).length}`);

    // @mention routing — if the user typed "@riko do X" at the start, swap in
    // Riko's role + tool subset so Slack behaves as a multi-persona bot.
    // Pattern: first word begins with @ AND matches a custom_agent slug owned
    // by this user. Gracefully falls through to default Sigap otherwise.
    type AgentRec = {
      id: string;
      slug: string;
      name: string;
      emoji: string | null;
      system_prompt: string;
      enabled_tools: string[];
      llm_override_provider: string | null;
      llm_override_model: string | null;
    };
    let agent: AgentRec | null = null;
    let userText = cleanText;
    // Accept ANY prefix style the user types — goal is zero friction on
    // Slack/Telegram where @-autocomplete might interfere:
    //   "@coder bikin X"   — @ prefix (needs Escape to dismiss Slack popup)
    //   "/coder bikin X"   — slash prefix
    //   "coder: bikin X"   — colon suffix
    //   "coder, bikin X"   — comma suffix
    //   "coder bikin X"    — plain first-word, no punctuation
    // Fallback case does an extra DB lookup per non-command message —
    // acceptable cost for solo-founder scale and dramatically better UX.
    const mention =
      cleanText.match(/^(?:@|\/)([a-z][a-z0-9-]{1,39})\b\s*/i) ??
      cleanText.match(/^([a-z][a-z0-9-]{1,39})\s*[:,]\s+/i) ??
      cleanText.match(/^([a-z][a-z0-9-]{1,39})\s+\S/i);
    if (mention) {
      const slug = mention[1].toLowerCase();
      const { data: found } = await sb
        .from("custom_agents")
        .select(
          "id, slug, name, emoji, system_prompt, enabled_tools, llm_override_provider, llm_override_model",
        )
        .eq("user_id", sigapUser.id)
        .eq("slug", slug)
        .maybeSingle();
      if (found) {
        agent = found as unknown as AgentRec;
        userText = cleanText.slice(mention[0].length).trim();
      }
    }

    // Resolve LLM AFTER agent lookup so override takes effect.
    const llm = await getLLMForAgent(sigapUser.id, agent);
    console.log(
      `[slack] llm=${llm.provider}/${llm.modelId} agent=${agent?.slug ?? "(default)"}`,
    );

    const tools = agent
      ? Object.fromEntries(
          Object.entries(allTools).filter(([k]) =>
            agent!.enabled_tools.includes(k),
          ),
        )
      : allTools;

    const defaultSystem = `You are Sigap, replying inside Slack. Keep replies under 400 chars when possible. ALWAYS call tools for real Google/notes/team data. Default timezone: Asia/Jakarta. Reply in same language the user wrote. When generate_image returns a URL, put the URL on its own line with no surrounding markdown so Slack auto-unfurls it into a preview.`;
    const systemPrompt = agent
      ? `${agent.system_prompt}\n\n## Slack-specific rules\nKeep replies under 400 chars when possible. Reply in same language the user wrote. When generate_image returns a URL, put the URL on its own line with no markdown so Slack auto-unfurls it.`
      : defaultSystem;

    const { data: prior } = await sb
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", sigapUser.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(10);
    const history = (prior ?? []).reverse() as {
      role: "user" | "assistant";
      content: string;
    }[];

    const result = await generateText({
      model: llm.model,
      system: systemPrompt,
      messages: [...history, { role: "user", content: userText }],
      tools,
      stopWhen: stepCountIs(6),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    await logUsage(
      sigapUser.id,
      tokensIn,
      tokensOut,
      estimateCost(llm.provider, tokensIn, tokensOut),
      llm.modelId,
    );

    // Scrub tokens before persisting (see redact-secrets for rationale).
    const savedTokens = extractSavedTokens(
      result.steps as Parameters<typeof extractSavedTokens>[0],
    );
    const redactedUser = redactSecrets(cleanText, savedTokens).redacted;
    const redactedAssistant = redactSecrets(result.text, savedTokens).redacted;

    await sb.from("chat_messages").insert([
      { user_id: sigapUser.id, role: "user", content: redactedUser, agent_id: agent?.id ?? null },
      { user_id: sigapUser.id, role: "assistant", content: redactedAssistant, agent_id: agent?.id ?? null },
    ]);

    // Make routing explicit — user asked "how do I know it's Coder or
    // default Sigap". Put the persona badge on its own line so it's
    // obvious, followed by a visual separator.
    const personaHeader = agent
      ? `${agent.emoji ?? "🤖"} *${agent.name}* _(@${agent.slug})_\n───────\n`
      : "_💬 Sigap (default)_\n───────\n";
    await postSlack(
      connector.access_token,
      channel,
      personaHeader + (result.text || "(no response)"),
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errName = e instanceof Error ? e.name : "UnknownError";
    const errStack = e instanceof Error ? e.stack?.split("\n").slice(0, 5).join("\n") : "";
    console.error(
      `[slack error] user=${sigapUser.email} name=${errName} msg="${errMsg}"\nstack: ${errStack}`,
    );
    await postSlack(
      connector.access_token,
      channel,
      `⚠️ Error: ${errMsg.slice(0, 300)}\n\n(Log diagnostic — screenshot ini ke admin: ${errName})`,
    );
  }
}

async function postSlack(token: string, channel: string, text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });
}
