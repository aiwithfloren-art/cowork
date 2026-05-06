import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateLinearToken } from "@/lib/linear/client";

export const runtime = "nodejs";

/**
 * Connect Linear via Personal API Key. User creates a key at
 * linear.app/settings/api, pastes it here. Validated against the
 * `viewer` query before storing.
 */
export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json(
      { error: "API key kosong atau terlalu pendek." },
      { status: 400 },
    );
  }

  const v = await validateLinearToken(token);
  if (!v.ok) {
    return NextResponse.json(
      {
        error:
          v.error ??
          "API key Linear tidak valid. Buat di linear.app/settings/api.",
      },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", uid)
    .eq("provider", "linear")
    .is("org_id", null)
    .maybeSingle();

  const payload = {
    user_id: uid,
    provider: "linear",
    access_token: token,
    external_account_label: v.user_email ?? v.user_name ?? null,
    metadata: { source: "user_paste", user_name: v.user_name },
    updated_at: new Date().toISOString(),
  };

  const err = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({ ok: true, user_email: v.user_email ?? null });
}
