import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Inbound lead capture from the /enterprise landing page.
 * Unauthenticated — the form is public. Basic sanitization + length caps
 * so we don't save garbage. Rate-limit-able later by IP if needed.
 */

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_WEBSITE = 300;
const MAX_USECASE = 2000;

function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export async function POST(req: Request) {
  let body: {
    full_name?: string;
    email?: string;
    company_website?: string;
    use_case?: string;
    team_size?: string;
    deployment_preference?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const full_name = (body.full_name ?? "").trim().slice(0, MAX_NAME);
  const email = (body.email ?? "").trim().slice(0, MAX_EMAIL);
  const company_website = (body.company_website ?? "").trim().slice(0, MAX_WEBSITE);
  const use_case = (body.use_case ?? "").trim().slice(0, MAX_USECASE);
  const team_size = (body.team_size ?? "").trim().slice(0, 50);
  const deployment_preference = (body.deployment_preference ?? "")
    .trim()
    .slice(0, 50);

  if (!full_name || !email) {
    return NextResponse.json(
      { error: "Full name and email are required" },
      { status: 400 },
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json(
      { error: "Email format looks off — double-check it?" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("enterprise_leads").insert({
    full_name,
    email,
    company_website: company_website || null,
    use_case: use_case || null,
    team_size: team_size || null,
    deployment_preference: deployment_preference || null,
  });

  if (error) {
    console.error("[enterprise-contact] insert failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't save. Try again, or email hello@cowork.example directly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
