import { supabaseAdmin } from "@/lib/supabase/admin";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function getNotionToken(userId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("connectors")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "notion")
    .is("org_id", null)
    .maybeSingle();
  return data?.access_token ?? null;
}

export async function notionFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function validateNotionToken(token: string): Promise<{
  ok: boolean;
  workspace_name?: string;
  bot_id?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${NOTION_API}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Token invalid (Notion responded ${res.status})`,
      };
    }
    const data = (await res.json()) as {
      bot?: { workspace_name?: string };
      id?: string;
    };
    return {
      ok: true,
      workspace_name: data.bot?.workspace_name,
      bot_id: data.id,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
