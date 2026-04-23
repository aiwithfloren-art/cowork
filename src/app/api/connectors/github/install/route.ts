import { NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Redirect the user to GitHub's OAuth consent. Requires:
 *   GITHUB_OAUTH_CLIENT_ID
 *   GITHUB_OAUTH_CLIENT_SECRET (used on callback only)
 *
 * OAuth App setup at github.com/settings/developers:
 *   Callback URL must be "<origin>/api/connectors/github/callback"
 */
export async function GET(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.redirect(new URL("/", req.url));

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "GITHUB_OAUTH_CLIENT_ID not configured. Register a GitHub OAuth App at github.com/settings/developers and set the env var.",
      },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/connectors/github/callback`;

  // Scopes sized for Coder/Reviewer agent work:
  //   - repo: full control of private + public repos (create, push, PR)
  //   - read:org: read org membership (for repo access under user's orgs)
  //   - user:email: fetch verified email for profile linking
  const scope = ["repo", "read:org", "user:email"].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state: `${uid}:${state}`,
    allow_signup: "false",
  });
  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
