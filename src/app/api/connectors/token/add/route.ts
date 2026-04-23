import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Block service slugs that collide with dedicated OAuth connectors — those
// go through their own install flow, not the generic token form.
const RESERVED = new Set(["google", "slack", "github", "notion", "composio"]);

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    service?: string;
    token?: string;
    label?: string | null;
  } | null;
  if (!body?.service || !body?.token) {
    return NextResponse.json(
      { error: "service + token required" },
      { status: 400 },
    );
  }
  const service = String(body.service).toLowerCase().trim();
  if (!/^[a-z0-9_-]{2,40}$/.test(service)) {
    return NextResponse.json(
      { error: "service slug must be 2-40 chars: lowercase, digits, -, _" },
      { status: 400 },
    );
  }
  if (RESERVED.has(service)) {
    return NextResponse.json(
      {
        error: `'${service}' has a dedicated OAuth connector — use that instead of pasting a raw token.`,
      },
      { status: 400 },
    );
  }
  const token = String(body.token).trim();
  if (token.length < 8) {
    return NextResponse.json(
      { error: "token looks too short to be valid" },
      { status: 400 },
    );
  }
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : null;

  const sb = supabaseAdmin();

  // Select-then-update/insert, same pattern as Slack/GitHub callbacks.
  const { data: existing } = await sb
    .from("connectors")
    .select("id")
    .eq("user_id", uid)
    .eq("provider", service)
    .is("org_id", null)
    .maybeSingle();

  const payload = {
    user_id: uid,
    provider: service,
    access_token: token,
    external_account_label: label,
    metadata: { source: "user_paste" },
    updated_at: new Date().toISOString(),
  };

  const err = existing
    ? (await sb.from("connectors").update(payload).eq("id", existing.id)).error
    : (await sb.from("connectors").insert(payload)).error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
