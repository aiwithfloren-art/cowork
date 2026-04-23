import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildToolsForUser } from "@/lib/llm/build-tools";
import { generateText, stepCountIs } from "ai";
import { getLLMForAgent } from "@/lib/llm/providers";
import { stripReasoningFromMessages } from "@/lib/llm/strip-reasoning";
import { redactSecrets, extractSavedTokens } from "@/lib/security/redact-secrets";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Slack Slash Command endpoint. Register `/sigap` at
 * https://api.slack.com/apps → your app → Slash Commands with
 * Request URL: https://<host>/api/slack/commands
 *
 * Usage once registered:
 *   /sigap                   — show help
 *   /sigap halo              — chat default Sigap
 *   /sigap coder bikin X     — route to @coder
 *   /sigap reviewer cek PR#  — route to @reviewer
 *
 * Slack demands a reply within 3s. We ACK immediately with an ephemeral
 * "thinking…" message, then process in after() and post the real answer
 * via response_url (30-min validity window). Matches the /api/slack/events
 * processing pipeline — same agent routing, same LLM, same tools.
 */

function verifySignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string,
): boolean {
  if (!timestamp || !signature) return false;
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

const HELP_TEXT = [
  "*Sigap slash command:*",
  "• `/sigap <prompt>` — chat default Sigap",
  "• `/sigap <agent-slug> <prompt>` — route to specific agent",
  "",
  "*Contoh:*",
  "• `/sigap halo tes`",
  "• `/sigap coder bikin landing page`",
  "• `/sigap reviewer cek commit kemarin`",
  "",
  "Daftar agent lo ada di web: https://cowork-gilt.vercel.app/agents",
].join("\n");

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

  const params = new URLSearchParams(rawBody);
  const text = (params.get("text") ?? "").trim();
  const userSlackId = params.get("user_id") ?? "";
  const channelId = params.get("channel_id") ?? "";
  const teamId = params.get("team_id") ?? "";
  const responseUrl = params.get("response_url") ?? "";

  if (!text) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: HELP_TEXT,
      mrkdwn: true,
    });
  }

  // Schedule background processing — Slack requires reply within 3s, so
  // we ACK immediately and post the real result via response_url later.
  after(() =>
    processSlashCommand({
      text,
      userSlackId,
      channelId,
      teamId,
      responseUrl,
    }),
  );

  return NextResponse.json({
    response_type: "ephemeral",
    text: "🤔 _Sigap lagi mikir..._",
    mrkdwn: true,
  });
}

type SlashArgs = {
  text: string;
  userSlackId: string;
  channelId: string;
  teamId: string;
  responseUrl: string;
};

async function respondEphemeral(responseUrl: string, text: string): Promise<void> {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_type: "ephemeral",
      text,
      mrkdwn: true,
      replace_original: true,
    }),
  }).catch(() => {});
}

async function respondInChannel(responseUrl: string, text: string): Promise<void> {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_type: "in_channel",
      text,
      mrkdwn: true,
      replace_original: true,
    }),
  }).catch(() => {});
}

async function processSlashCommand(args: SlashArgs): Promise<void> {
  const { text, userSlackId, teamId, responseUrl } = args;
  const sb = supabaseAdmin();

  const { data: connector } = await sb
    .from("connectors")
    .select("user_id, access_token, external_account_id")
    .eq("provider", "slack")
    .eq("external_account_id", teamId)
    .maybeSingle();
  if (!connector) {
    await respondEphemeral(
      responseUrl,
      "⚠️ Slack workspace belum ter-connect ke Sigap. Buka https://cowork-gilt.vercel.app/settings/connectors → Connect Slack.",
    );
    return;
  }

  // Resolve Slack email → Sigap user
  const profileRes = await fetch(
    `https://slack.com/api/users.info?user=${userSlackId}`,
    { headers: { Authorization: `Bearer ${connector.access_token}` } },
  );
  const profile = (await profileRes.json()) as {
    ok: boolean;
    error?: string;
    user?: { profile?: { email?: string } };
  };
  if (!profile.ok) {
    const slackErr = profile.error ?? "unknown_error";
    await respondEphemeral(
      responseUrl,
      `⚠️ Slack auth issue (${slackErr}). Reconnect Slack di Sigap settings.`,
    );
    return;
  }
  const slackEmail = profile.user?.profile?.email;
  if (!slackEmail) {
    await respondEphemeral(
      responseUrl,
      "⚠️ Sigap ga bisa baca email Slack lo. Scope `users:read.email` mungkin belum granted. Reconnect Slack.",
    );
    return;
  }

  const { data: sigapUser } = await sb
    .from("users")
    .select("id, email")
    .eq("email", slackEmail)
    .maybeSingle();
  if (!sigapUser) {
    await respondEphemeral(
      responseUrl,
      `Email Slack lo (${slackEmail}) ga match Sigap account. Sign in ke https://cowork-gilt.vercel.app pake email yang sama.`,
    );
    return;
  }

  try {
    const allTools = await buildToolsForUser(sigapUser.id);

    // Same flexible agent routing as main Slack events handler.
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
    let userText = text;
    const mention =
      text.match(/^(?:@|\/)([a-z][a-z0-9-]{1,39})\b\s*/i) ??
      text.match(/^([a-z][a-z0-9-]{1,39})\s*[:,]\s+/i) ??
      text.match(/^([a-z][a-z0-9-]{1,39})\s+\S/i);
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
        userText = text.slice(mention[0].length).trim();
      }
    }

    const tools = agent
      ? Object.fromEntries(
          Object.entries(allTools).filter(([k]) =>
            agent!.enabled_tools.includes(k),
          ),
        )
      : allTools;

    const llm = await getLLMForAgent(sigapUser.id, agent);

    const nowJakarta = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    const defaultSystem = `You are Sigap, replying inside Slack via slash command. Current time: ${nowJakarta} Asia/Jakarta. Keep replies under 400 chars when possible. ALWAYS call tools for real data. Default timezone: Asia/Jakarta. Reply in same language the user wrote.`;
    const systemPrompt = agent
      ? `${agent.system_prompt}\n\n## Slack slash command rules\nReply in same language the user wrote. Keep under 400 chars when possible. Current time: ${nowJakarta} Asia/Jakarta.`
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

    // Scrub tokens before persisting.
    const savedTokens = extractSavedTokens(
      result.steps as Parameters<typeof extractSavedTokens>[0],
    );
    const redactedUser = redactSecrets(text, savedTokens).redacted;
    const redactedAssistant = redactSecrets(result.text, savedTokens).redacted;

    await sb.from("chat_messages").insert([
      {
        user_id: sigapUser.id,
        role: "user",
        content: `/sigap ${redactedUser}`,
        agent_id: agent?.id ?? null,
      },
      {
        user_id: sigapUser.id,
        role: "assistant",
        content: redactedAssistant,
        agent_id: agent?.id ?? null,
      },
    ]);

    const personaHeader = agent
      ? `${agent.emoji ?? "🤖"} *${agent.name}* _(@${agent.slug})_\n───────\n`
      : "💬 _Sigap (default)_\n───────\n";

    // Visible to everyone in channel — slash commands usually go here
    // so the user's slash invocation feels like a real conversation.
    // (Switch to respondEphemeral if user prefers private-to-self.)
    await respondInChannel(
      responseUrl,
      personaHeader + (result.text || "(no response)"),
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errName = e instanceof Error ? e.name : "UnknownError";
    console.error(
      `[slack command error] user=${sigapUser.email} name=${errName} msg="${errMsg}"`,
    );
    await respondEphemeral(
      responseUrl,
      `⚠️ Error: ${errMsg.slice(0, 300)}\n\n(${errName})`,
    );
  }
}
