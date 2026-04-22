import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConnectedToolkits } from "@/lib/composio/tools";

export const runtime = "nodejs";

/**
 * Org-scoped Composio status: which shared toolkits has the owner
 * connected for this team? Used by /team/connectors UI.
 */
export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) {
    return NextResponse.json({ enabled: [], connected: [] });
  }

  const entity = `org_${membership.org_id}`;
  const connected = await listConnectedToolkits(entity);
  const enabledRaw = process.env.COMPOSIO_TOOLKITS || "";
  const enabled = enabledRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return NextResponse.json({ enabled, connected });
}
