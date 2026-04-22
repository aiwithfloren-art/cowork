import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateConnectUrl } from "@/lib/composio/tools";

export const runtime = "nodejs";

/**
 * Org-scoped Composio connect — used by owner/manager on /team/connectors
 * to wire up shared integrations (Notion workspace, Slack, Linear, etc.)
 * that all AI employees in the org get access to.
 *
 * The Composio "entity" for these connections is the literal string
 * `org_<orgId>`, distinct from per-user entities (which use raw user IDs).
 * This lets buildToolsForUser() later fetch both the user's personal
 * Composio tools AND the org's shared ones, merging them cleanly.
 */
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
      { error: "You must belong to a team to connect shared tools" },
      { status: 400 },
    );
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return NextResponse.json(
      { error: "Only owner or manager can connect shared tools" },
      { status: 403 },
    );
  }

  const h = await headers();
  const host = h.get("host") ?? "cowork-gilt.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const callbackUrl = `${proto}://${host}/team/connectors`;

  const entity = `org_${membership.org_id}`;
  const result = await generateConnectUrl(entity, toolkit, callbackUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
