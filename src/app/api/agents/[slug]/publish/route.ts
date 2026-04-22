import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Publish one of the user's custom agents as an org-wide template. Only
 * owner/manager of the org can publish. The template is a frozen snapshot
 * of the agent at publish time — future edits to the source agent do NOT
 * propagate to installed copies (we treat install as a fork for simplicity).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  // Load the source agent owned by this user
  const { data: agent } = await sb
    .from("custom_agents")
    .select(
      "name, emoji, description, system_prompt, enabled_tools, objectives",
    )
    .eq("user_id", uid)
    .eq("slug", slug)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Resolve the publisher's primary org + enforce role
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) {
    return NextResponse.json(
      { error: "You must belong to an organization to publish skills" },
      { status: 400 },
    );
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return NextResponse.json(
      { error: "Only owner or manager can publish skills" },
      { status: 403 },
    );
  }

  // Prevent duplicate publication by name within the same org — update the
  // existing template row instead of creating a second one.
  const { data: existing } = await sb
    .from("org_agent_templates")
    .select("id")
    .eq("org_id", membership.org_id)
    .eq("name", agent.name)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("org_agent_templates")
      .update({
        emoji: agent.emoji ?? null,
        description: agent.description ?? null,
        system_prompt: agent.system_prompt,
        enabled_tools: agent.enabled_tools ?? [],
        objectives: agent.objectives ?? [],
        source_slug: slug,
        published_by: uid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, template_id: existing.id, updated: true });
  }

  const { data: created, error: insertErr } = await sb
    .from("org_agent_templates")
    .insert({
      org_id: membership.org_id,
      published_by: uid,
      source_slug: slug,
      name: agent.name,
      emoji: agent.emoji ?? null,
      description: agent.description ?? null,
      system_prompt: agent.system_prompt,
      enabled_tools: agent.enabled_tools ?? [],
      objectives: agent.objectives ?? [],
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Publish failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, template_id: created.id, updated: false });
}
