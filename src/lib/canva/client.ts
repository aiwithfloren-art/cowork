import { supabaseAdmin } from "@/lib/supabase/admin";

const CANVA_API = "https://api.canva.com/rest/v1";

type CanvaConnectorRow = {
  id: string;
  access_token: string | null;
  scope: string | null;
  metadata: {
    refresh_token?: string | null;
    expires_at?: string | null;
  } | null;
};

async function loadConnector(userId: string): Promise<CanvaConnectorRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("connectors")
    .select("id, access_token, scope, metadata")
    .eq("user_id", userId)
    .eq("provider", "canva")
    .is("org_id", null)
    .maybeSingle();
  return (data as CanvaConnectorRow | null) ?? null;
}

async function refreshToken(
  rowId: string,
  refreshToken: string,
): Promise<string | null> {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) return null;

  const sb = supabaseAdmin();
  await sb
    .from("connectors")
    .update({
      access_token: json.access_token,
      metadata: {
        source: "oauth",
        refresh_token: json.refresh_token ?? refreshToken,
        expires_at: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000).toISOString()
          : null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);
  return json.access_token;
}

export async function getCanvaToken(userId: string): Promise<string | null> {
  const row = await loadConnector(userId);
  if (!row?.access_token) return null;

  // If we know an expiry and it's <2 minutes away, refresh proactively.
  const expiresAt = row.metadata?.expires_at
    ? new Date(row.metadata.expires_at).getTime()
    : null;
  const refreshTok = row.metadata?.refresh_token ?? null;
  if (expiresAt && refreshTok && Date.now() > expiresAt - 120_000) {
    const fresh = await refreshToken(row.id, refreshTok);
    if (fresh) return fresh;
  }
  return row.access_token;
}

/**
 * Authenticated Canva API fetch with automatic refresh-on-401. Throws
 * a typed error containing the API's error body so tool wrappers can
 * surface useful messages to the LLM.
 */
export async function canvaFetch(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = await getCanvaToken(userId);
  if (!token) throw new Error("Canva not connected");

  const doFetch = (bearer: string) =>
    fetch(`${CANVA_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  let res = await doFetch(token);

  // Reactive refresh fallback (in case proactive miss-timing).
  if (res.status === 401) {
    const row = await loadConnector(userId);
    const rt = row?.metadata?.refresh_token;
    if (row && rt) {
      const fresh = await refreshToken(row.id, rt);
      if (fresh) res = await doFetch(fresh);
    }
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Canva ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}
