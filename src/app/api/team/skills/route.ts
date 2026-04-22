import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * List skill templates published in the caller's primary org, along with
 * whether the caller has already installed each template (by name match in
 * custom_agents). This powers the /team/skills browse UI.
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
    return NextResponse.json({ templates: [] });
  }

  const { data: templates } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, description, enabled_tools, install_count, published_at, published_by",
    )
    .eq("org_id", membership.org_id)
    .order("published_at", { ascending: false });

  // Check which templates this user already has installed (by name)
  const names = (templates ?? []).map((t) => t.name);
  const { data: installed } = names.length
    ? await sb
        .from("custom_agents")
        .select("name, slug")
        .eq("user_id", uid)
        .in("name", names)
    : { data: [] };

  const installedMap = new Map(
    (installed ?? []).map((a) => [a.name as string, a.slug as string]),
  );

  // Lookup publisher names
  const publisherIds = Array.from(
    new Set(
      (templates ?? []).map((t) => t.published_by).filter(Boolean) as string[],
    ),
  );
  const { data: publishers } = publisherIds.length
    ? await sb
        .from("users")
        .select("id, name, email")
        .in("id", publisherIds)
    : { data: [] };
  const publisherMap = new Map(
    (publishers ?? []).map((p) => [
      p.id as string,
      (p.name as string | null) ?? (p.email as string),
    ]),
  );

  const enriched = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    description: t.description,
    enabled_tools: t.enabled_tools,
    install_count: t.install_count,
    published_at: t.published_at,
    published_by_name: t.published_by
      ? publisherMap.get(t.published_by as string) ?? null
      : null,
    installed_slug: installedMap.get(t.name as string) ?? null,
  }));

  return NextResponse.json({ templates: enriched });
}
