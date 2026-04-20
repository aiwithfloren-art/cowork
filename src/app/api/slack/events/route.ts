import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { generateText, stepCountIs } from "ai";
import { getGroq, DEFAULT_MODEL, estimateCost } from "@/lib/llm/client";
import { checkRateLimit, logUsage } from "@/lib/ratelimit";
import { tryInterceptDelegation } from "@/lib/llm/delegate-intercept";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";

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

  if (!connector) return;

  const profileRes = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    { headers: { Authorization: `Bearer ${connector.access_token}` } },
  );
  const profile = (await profileRes.json()) as {
    ok: boolean;
    user?: { profile?: { email?: string } };
  };
  const slackEmail = profile.user?.profile?.email;
  if (!slackEmail) return;

  const { data: sigapUser } = await sb
    .from("users")
    .select("id, email")
    .eq("email", slackEmail)
    .maybeSingle();

  if (!sigapUser) {
    await postSlack(
      connector.access_token,
      channel,
      `Hi! I'd love to help, but I don't see a Sigap account linked to ${slackEmail}. Sign in at https://cowork-gilt.vercel.app first, then talk to me here.`,
    );
    return;
  }

  const { data: settings } = await sb
    .from("user_settings")
    .select("groq_key")
    .eq("user_id", sigapUser.id)
    .maybeSingle();
  const userHasOwnKey = Boolean(settings?.groq_key);
  const rl = await checkRateLimit(sigapUser.id, userHasOwnKey);
  if (!rl.ok) {
    await postSlack(connector.access_token, channel, `⚠️ ${rl.message}`);
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
    const groq = getGroq(settings?.groq_key ?? undefined);
    const tools = await buildToolsForUser(sigapUser.id);

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
      model: groq(DEFAULT_MODEL),
      system: `You are Sigap, replying inside Slack. Keep replies under 400 chars when possible. ALWAYS call tools for real Google/notes/team data. Default timezone: Asia/Jakarta. Reply in same language the user wrote.`,
      messages: [...history, { role: "user", content: cleanText }],
      tools,
      stopWhen: stepCountIs(6),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

    const tokensIn = result.usage?.inputTokens ?? 0;
    const tokensOut = result.usage?.outputTokens ?? 0;
    if (!userHasOwnKey) {
      await logUsage(
        sigapUser.id,
        tokensIn,
        tokensOut,
        estimateCost(tokensIn, tokensOut),
        DEFAULT_MODEL,
      );
    }

    await sb.from("chat_messages").insert([
      { user_id: sigapUser.id, role: "user", content: cleanText },
      { user_id: sigapUser.id, role: "assistant", content: result.text },
    ]);

    await postSlack(
      connector.access_token,
      channel,
      result.text || "(no response)",
    );
  } catch (e) {
    console.error("slack events ai error:", e);
    await postSlack(
      connector.access_token,
      channel,
      "⚠️ Something went wrong. Try again in a moment.",
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
