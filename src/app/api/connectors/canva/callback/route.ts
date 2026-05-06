import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

/**
 * Canva OAuth callback. Validates state from cookie, exchanges
 * authorization code (with PKCE verifier) for access + refresh tokens,
 * stores them in `connectors`. Redirects back to /integrations with a
 * status query string.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (errParam) {
    return NextResponse.redirect(
      new URL(`/integrations?error=canva_${errParam}`, req.url),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/integrations?error=canva_missing_code", req.url),
    );
  }

  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("canva_oauth="));
  if (!cookie) {
    return NextResponse.redirect(
      new URL("/integrations?error=canva_state_expired", req.url),
    );
  }
  let parsed: { state: string; verifier: string; uid: string };
  try {
    parsed = JSON.parse(decodeURIComponent(cookie.split("=").slice(1).join("=")));
  } catch {
    return NextResponse.redirect(
      new URL("/integrations?error=canva_bad_state_cookie", req.url),
    );
  }
  if (parsed.state !== state) {
    return NextResponse.redirect(
      new URL("/integrations?error=canva_state_mismatch", req.url),
    );
  }

  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/integrations?error=canva_server_misconfig", req.url),
    );
  }

  // Must match the redirect_uri sent by /install (canonical URL, not the
  // preview-deploy URL the user might be on).
  const redirectUri = `${getAppUrl(req)}/api/connectors/canva/callback`;

  // Canva token endpoint: client credentials sent via Basic auth header.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: parsed.verifier,
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!tokenRes.ok || !tokenJson?.access_token) {
    const reason = tokenJson?.error_description ?? tokenJson?.error ?? "unknown";
    return NextResponse.redirect(
      new URL(
        `/integrations?error=canva_token_${encodeURIComponent(reason)}`,
        req.url,
      ),
    );
  }

  // Look up user's email/profile via /users/me for display label.
  let label: string | null = null;
  try {
    const meRes = await fetch("https://api.canva.com/rest/v1/users/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        team?: { id?: string };
        user?: { id?: string };
      };
      label = me.team?.id ?? me.user?.id ?? null;
    }
  } catch {
    // non-fatal
  }

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", parsed.uid)
    .eq("provider", "canva")
    .is("org_id", null)
    .maybeSingle();

  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : null;

  // The connectors table doesn't have dedicated columns for refresh_token
  // or expires_at; stash them in metadata so the client wrapper can refresh
  // when access_token expires (Canva tokens last ~4 hours).
  const payload = {
    user_id: parsed.uid,
    provider: "canva",
    access_token: tokenJson.access_token,
    external_account_label: label,
    scope: tokenJson.scope ?? null,
    metadata: {
      source: "oauth",
      refresh_token: tokenJson.refresh_token ?? null,
      expires_at: expiresAt,
    },
    updated_at: new Date().toISOString(),
  };

  const dbErr = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (dbErr) {
    return NextResponse.redirect(
      new URL(
        `/integrations?error=canva_db_${encodeURIComponent(dbErr.message)}`,
        req.url,
      ),
    );
  }

  const res = NextResponse.redirect(
    new URL("/integrations?connected=Canva", req.url),
  );
  // Clear the OAuth state cookie now that the round-trip is complete.
  res.cookies.set("canva_oauth", "", {
    httpOnly: true,
    path: "/api/connectors/canva",
    maxAge: 0,
  });
  return res;
}
