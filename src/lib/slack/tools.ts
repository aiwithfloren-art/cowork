import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Slack tools. Only returned by buildSlackTools when the user has
 * an active Slack connector row. Merged into the main tool list via
 * buildTools -> getConnectorTools.
 */
type SlackChannel = { id: string; name: string; is_private: boolean };

async function getSlackToken(userId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("connectors")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .maybeSingle();
  return data?.access_token ?? null;
}

export function buildSlackTools(userId: string) {
  return {
    list_slack_channels: tool({
      description:
        "List the user's Slack channels they can post to. Call when the user references a channel by name and you need the channel ID. Returns id + name + is_private.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log("[list_slack_channels] called by", userId);
        const token = await getSlackToken(userId);
        if (!token) {
          console.log("[list_slack_channels] no token");
          return { error: "Slack not connected. Ask user to connect at /settings/connectors." };
        }
        const res = await fetch(
          "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          channels?: SlackChannel[];
        };
        console.log("[list_slack_channels] slack ok:", data.ok, "count:", data.channels?.length);
        if (!data.ok) return { error: data.error || "slack error" };
        return {
          count: data.channels?.length ?? 0,
          channels: (data.channels ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            private: c.is_private,
          })),
        };
      },
    }),

    post_slack_message: tool({
      description:
        "Post a message to a Slack channel. Use for 'post to #general X', 'kirim update ke slack'. If the user says a channel name, call list_slack_channels first to get the ID.",
      inputSchema: z.object({
        channel: z
          .string()
          .describe("Channel ID (e.g. C01234) — get from list_slack_channels"),
        text: z.string().describe("Message text (plain or Slack mrkdwn)"),
      }),
      execute: async ({ channel, text }) => {
        const token = await getSlackToken(userId);
        if (!token) return { error: "Slack not connected." };
        const res = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel, text }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; ts?: string };
        if (!data.ok) return { error: data.error || "post failed" };
        return { ok: true, ts: data.ts };
      },
    }),

    search_slack: tool({
      description:
        "Search Slack messages across the workspace. Use for 'cari diskusi soal X di slack', 'ada thread tentang Y'.",
      inputSchema: z.object({
        query: z.string().describe("Slack search query"),
      }),
      execute: async ({ query }) => {
        const token = await getSlackToken(userId);
        if (!token) return { error: "Slack not connected." };
        const res = await fetch(
          `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=10`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          messages?: {
            matches?: Array<{
              text?: string;
              user?: string;
              channel?: { name?: string };
              permalink?: string;
              ts?: string;
            }>;
          };
        };
        if (!data.ok) return { error: data.error || "search failed" };
        const matches = data.messages?.matches ?? [];
        return {
          count: matches.length,
          results: matches.map((m) => ({
            text: m.text?.slice(0, 400),
            channel: m.channel?.name,
            permalink: m.permalink,
          })),
        };
      },
    }),
  };
}
