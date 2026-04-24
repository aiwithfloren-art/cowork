import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { disconnectToolkit } from "@/lib/composio/tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toolkit } = (await req.json()) as { toolkit?: string };
  if (!toolkit) {
    return NextResponse.json({ error: "toolkit required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) {
    return NextResponse.json(
      { error: "You must belong to a team to manage shared tools" },
      { status: 400 },
    );
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return NextResponse.json(
      { error: "Only owner or manager can disconnect shared tools" },
      { status: 403 },
    );
  }

  const entity = `org_${membership.org_id}`;
  const result = await disconnectToolkit(entity, toolkit);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
