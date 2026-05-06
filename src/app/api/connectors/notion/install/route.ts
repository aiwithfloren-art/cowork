import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateNotionToken } from "@/lib/notion/client";

export const runtime = "nodejs";

/**
 * Connect Notion via Internal Integration Token. User creates an
 * integration at notion.so/profile/integrations, copies the secret,
 * pastes it here. We validate against /users/me before storing so
 * bad tokens fail fast with a clear message.
 *
 * Future: replace with public OAuth flow once Notion OAuth app is
 * registered. UI on /integrations stays the same — only the route
 * implementation swaps.
 */
export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json(
      { error: "Token kosong atau terlalu pendek." },
      { status: 400 },
    );
  }

  const v = await validateNotionToken(token);
  if (!v.ok) {
    return NextResponse.json(
      {
        error:
          v.error ??
          "Token Notion tidak valid. Pastikan kamu copy 'Internal Integration Secret' dari notion.so/profile/integrations.",
      },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", uid)
    .eq("provider", "notion")
    .is("org_id", null)
    .maybeSingle();

  const payload = {
    user_id: uid,
    provider: "notion",
    access_token: token,
    external_account_label: v.workspace_name ?? null,
    metadata: { source: "user_paste", bot_id: v.bot_id },
    updated_at: new Date().toISOString(),
  };

  const err = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    workspace_name: v.workspace_name ?? null,
  });
}
