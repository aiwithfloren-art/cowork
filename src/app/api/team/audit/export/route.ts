import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Export the complete audit log for the caller's primary org as JSON.
 * Owner-only — the log contains sensitive context (manager queries +
 * AI answers) that should not leave the owner's hands.
 *
 * Used by the /team/compliance page download button and by external
 * auditors via a service-account curl against a short-lived cookie.
 */
export async function GET() {
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
  if (!membership?.org_id) {
    return NextResponse.json({ error: "No org" }, { status: 400 });
  }
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can export the audit log" },
      { status: 403 },
    );
  }

  const { data: entries } = await sb
    .from("audit_log")
    .select("*")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })
    .limit(10000);

  const payload = {
    exported_at: new Date().toISOString(),
    exported_by: uid,
    org_id: membership.org_id,
    entry_count: entries?.length ?? 0,
    entries: entries ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cowork-audit-log-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
