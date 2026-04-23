import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GitHub OAuth callback. Exchanges the code for an access token, fetches
 * the authenticated user's login (for display), and stores the token in
 * the connectors table. Follows the same select→update/insert pattern as
 * the Slack callback to avoid the partial-unique-index upsert trap.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings/connectors?error=missing_code", req.url),
    );
  }

  const userId = state.split(":")[0];
  if (!userId) {
    return NextResponse.redirect(
      new URL("/settings/connectors?error=bad_state", req.url),
    );
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/settings/connectors?error=server_misconfig", req.url),
    );
  }

  // Exchange code → token.
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${url.origin}/api/connectors/github/callback`,
      }),
    },
  );
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenJson.access_token) {
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(
          tokenJson.error_description ?? tokenJson.error ?? "no_token",
        )}`,
        req.url,
      ),
    );
  }

  // Fetch username (login) for the display label.
  let login: string | null = null;
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (userRes.ok) {
      const u = (await userRes.json()) as { login?: string };
      login = u.login ?? null;
    }
  } catch {
    // label is cosmetic — if we can't fetch, just store token anyway
  }

  const sb = supabaseAdmin();

  const { data: existing, error: selectErr } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "github")
    .is("org_id", null)
    .maybeSingle();
  if (selectErr) {
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(selectErr.message)}`,
        req.url,
      ),
    );
  }

  const payload = {
    user_id: userId,
    provider: "github",
    access_token: tokenJson.access_token,
    scope: tokenJson.scope ?? null,
    external_account_id: login,
    external_account_label: login,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const writeErr = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (writeErr) {
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(writeErr.message)}`,
        req.url,
      ),
    );
  }

  return NextResponse.redirect(
    new URL("/settings/connectors?connected=github", req.url),
  );
}
