import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SlackOAuthResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string };
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings/connectors?error=missing_code", req.url));
  }

  const userId = state.split(":")[0];
  if (!userId) {
    return NextResponse.redirect(new URL("/settings/connectors?error=bad_state", req.url));
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings/connectors?error=server_misconfig", req.url));
  }

  const redirectUri = `${url.origin}/api/connectors/slack/callback`;
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await tokenRes.json()) as SlackOAuthResponse;
  if (!data.ok || !data.access_token) {
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(data.error || "exchange_failed")}`,
        req.url,
      ),
    );
  }

  const sb = supabaseAdmin();

  // Partial unique index (user_id, provider) WHERE org_id IS NULL doesn't play
  // nicely with PostgREST upsert. Do explicit select → update/insert so the
  // row is actually written — the previous upsert was failing silently, which
  // looked to the user like "OAuth loops without connecting".
  const { data: existing, error: selectErr } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .is("org_id", null)
    .maybeSingle();
  if (selectErr) {
    console.error("slack callback select failed:", selectErr);
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(selectErr.message)}`,
        req.url,
      ),
    );
  }

  const payload = {
    user_id: userId,
    provider: "slack",
    access_token: data.access_token,
    scope: data.scope ?? null,
    external_account_id: data.team?.id ?? null,
    external_account_label: data.team?.name ?? null,
    metadata: { authed_user: data.authed_user?.id ?? null },
    updated_at: new Date().toISOString(),
  };

  const writeErr = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (writeErr) {
    console.error("slack callback write failed:", writeErr);
    return NextResponse.redirect(
      new URL(
        `/settings/connectors?error=${encodeURIComponent(writeErr.message)}`,
        req.url,
      ),
    );
  }

  return NextResponse.redirect(new URL("/settings/connectors?connected=slack", req.url));
}
