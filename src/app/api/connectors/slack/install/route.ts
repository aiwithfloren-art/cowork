import { NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";

export const runtime = "nodejs";

// Redirect user to Slack's OAuth consent screen.
// Requires env vars: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
// Register an app at https://api.slack.com/apps and add redirect URL
// https://your-domain.com/api/connectors/slack/callback
export async function GET(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.redirect(new URL("/", req.url));

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID not configured on server" },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/connectors/slack/callback`;

  // users:read.email is CRITICAL — without it, Slack's users.info API
  // returns user profile with no `email` field, so we can't map Slack
  // users to Sigap users. Silent failure mode = bot never responds or
  // returns "User not found" in error paths. users:read alone gives
  // name/avatar but not email.
  const scope = [
    "channels:read",
    "chat:write",
    "users:read",
    "users:read.email",
    "search:read.public",
  ].join(",");

  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    user_scope: "",
    redirect_uri: redirectUri,
    state: `${uid}:${state}`,
  });

  const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
