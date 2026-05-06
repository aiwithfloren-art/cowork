import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seedStarterSkills } from "@/lib/starter-kit";

export const runtime = "nodejs";

/**
 * Owner-only admin endpoint to backfill any newly-added starter
 * templates (e.g., "Campaign Generator") into an existing org. Idempotent
 * thanks to seedStarterSkills's (org_id, name) skip-on-exists guard —
 * safe to call repeatedly. Returns the count of templates currently in
 * the org so the caller can confirm what's there.
 */
export async function POST() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id || membership.role !== "owner") {
    return NextResponse.json(
      { error: "Owner access required" },
      { status: 403 },
    );
  }

  await seedStarterSkills(membership.org_id as string);

  const { data: tmpls } = await sb
    .from("org_agent_templates")
    .select("name, emoji")
    .eq("org_id", membership.org_id);

  return NextResponse.json({
    ok: true,
    org_id: membership.org_id,
    template_count: tmpls?.length ?? 0,
    templates: tmpls ?? [],
  });
}
