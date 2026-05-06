import { NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

/**
 * Redirect the user to Canva's OAuth consent. Requires:
 *   CANVA_CLIENT_ID
 *   CANVA_CLIENT_SECRET (used on callback)
 *
 * Canva uses OAuth 2.0 with PKCE (mandatory). We:
 *  1. Generate a random code_verifier (base64url, 64 bytes raw → 86 chars)
 *  2. Compute code_challenge = SHA256(verifier), base64url
 *  3. Stash verifier in a short-lived httpOnly cookie so the callback
 *     can complete the exchange without needing a DB table.
 *
 * App setup at canva.com/developers/integrations:
 *   Redirect URL must be "<origin>/api/connectors/canva/callback"
 */

const CANVA_SCOPES = [
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "asset:read",
  "asset:write",
  "brandtemplate:meta:read",
  "brandtemplate:content:read",
  "folder:read",
];

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function GET(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.redirect(new URL("/", req.url));

  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "CANVA_CLIENT_ID not configured. Owner must register an integration at canva.com/developers/integrations and set the env var.",
      },
      { status: 500 },
    );
  }

  // Use the canonical app URL (NEXTAUTH_URL) instead of the request origin.
  // Vercel preview deploys have URLs like cowork-abc123.vercel.app, but the
  // Canva integration only has the production URL registered as a valid
  // Redirect URL. Using req.url origin from a preview deploy → mismatch →
  // Canva returns "client_id invalid" or "redirect_uri mismatch".
  const redirectUri = `${getAppUrl(req)}/api/connectors/canva/callback`;

  const verifier = base64UrlEncode(crypto.randomBytes(64));
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CANVA_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    `https://www.canva.com/api/oauth/authorize?${params.toString()}`,
  );
  // 10-minute httpOnly cookie holds the PKCE verifier + state for callback
  // verification. Never readable by JS, expires after the OAuth round-trip.
  const cookieValue = JSON.stringify({ state, verifier, uid });
  res.cookies.set("canva_oauth", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.url.startsWith("https://"),
    path: "/api/connectors/canva",
    maxAge: 600,
  });
  return res;
}
