import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_DESC = 2000;
const MAX_TONE = 300;
const MAX_WEBSITES = 10;
const MAX_URL = 300;

function sanitizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_URL) return null;
  // Accept bare domains (acme.com) and full URLs. Require at least one dot
  // so we don't accept random strings.
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    org_id: string;
    description?: string;
    brand_tone?: string;
    websites?: string[];
  };
  if (!body.org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: me } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", body.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (me?.role !== "owner" && me?.role !== "manager") {
    return NextResponse.json(
      { error: "Only owner or manager can edit company profile" },
      { status: 403 },
    );
  }

  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, MAX_DESC)
      : "";

  const brandTone =
    typeof body.brand_tone === "string"
      ? body.brand_tone.trim().slice(0, MAX_TONE)
      : "";

  const websites = Array.isArray(body.websites)
    ? (body.websites
        .map(sanitizeWebsite)
        .filter((w): w is string => !!w)
        .slice(0, MAX_WEBSITES))
    : [];

  const { error } = await sb
    .from("organizations")
    .update({
      description: description || null,
      brand_tone: brandTone || null,
      websites,
    })
    .eq("id", body.org_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, description, brand_tone: brandTone, websites });
}
