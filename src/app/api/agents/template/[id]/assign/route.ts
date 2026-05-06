import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assignTemplateToUsers } from "@/lib/agents/assign-to-users";

export const runtime = "nodejs";

/**
 * Admin assigns a previously-published org_agent_template to one or
 * more employees. (For the "publish-if-needed + assign" flow from a
 * personal agent slug, see /api/agents/[slug]/quick-assign.)
 */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actor = session?.user as
    | { id?: string; name?: string | null; email?: string | null }
    | undefined;
  if (!actor?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = (await req.json().catch(() => null)) as {
    user_ids?: string[];
    note?: string;
  } | null;
  const userIds = body?.user_ids?.filter((s) => typeof s === "string") ?? [];
  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "user_ids array required" },
      { status: 400 },
    );
  }
  const note = body?.note?.trim().slice(0, 500) || null;

  const sb = supabaseAdmin();
  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select(
      "id, org_id, name, emoji, description, system_prompt, enabled_tools, objectives",
    )
    .eq("id", templateId)
    .maybeSingle();
  if (!tmpl)
    return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: actorMembership } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", actor.id)
    .eq("org_id", tmpl.org_id)
    .maybeSingle();
  if (
    !actorMembership ||
    !["owner", "manager"].includes(actorMembership.role as string)
  ) {
    return NextResponse.json(
      { error: "Only owner/manager can assign agents" },
      { status: 403 },
    );
  }

  const results = await assignTemplateToUsers({
    template: {
      id: tmpl.id as string,
      org_id: tmpl.org_id as string,
      name: tmpl.name as string,
      emoji: (tmpl.emoji as string | null) ?? null,
      description: (tmpl.description as string | null) ?? null,
      system_prompt: tmpl.system_prompt as string,
      enabled_tools: (tmpl.enabled_tools as string[] | null) ?? [],
      objectives: (tmpl.objectives as string[] | null) ?? [],
    },
    actor: { id: actor.id, name: actor.name ?? null },
    userIds,
    note,
  });

  return NextResponse.json({ results });
}

/**
 * Admin unassigns a template from one user. Deletes the cloned custom_agent
 * row (employee can't self-delete) and marks the assignment as removed.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actor = session?.user as { id?: string } | undefined;
  if (!actor?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("user_id");
  if (!targetUserId)
    return NextResponse.json(
      { error: "user_id query required" },
      { status: 400 },
    );

  const sb = supabaseAdmin();

  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select("id, org_id, name")
    .eq("id", templateId)
    .maybeSingle();
  if (!tmpl)
    return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: actorMembership } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", actor.id)
    .eq("org_id", tmpl.org_id)
    .maybeSingle();
  if (
    !actorMembership ||
    !["owner", "manager"].includes(actorMembership.role as string)
  ) {
    return NextResponse.json(
      { error: "Only owner/manager can unassign" },
      { status: 403 },
    );
  }

  const { data: assignment } = await sb
    .from("agent_assignments")
    .select("id, cloned_agent_slug")
    .eq("template_id", templateId)
    .eq("assigned_to_user_id", targetUserId)
    .eq("status", "active")
    .maybeSingle();
  if (!assignment)
    return NextResponse.json(
      { error: "No active assignment found" },
      { status: 404 },
    );

  if (assignment.cloned_agent_slug) {
    await sb
      .from("custom_agents")
      .delete()
      .eq("user_id", targetUserId)
      .eq("slug", assignment.cloned_agent_slug);
  }

  await sb
    .from("agent_assignments")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("id", assignment.id);

  return NextResponse.json({ ok: true });
}

/**
 * GET — list active assignments for this template (admin oversight).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actor = session?.user as { id?: string } | undefined;
  if (!actor?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const sb = supabaseAdmin();

  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select("org_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!tmpl)
    return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: actorMembership } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", actor.id)
    .eq("org_id", tmpl.org_id)
    .maybeSingle();
  if (
    !actorMembership ||
    !["owner", "manager"].includes(actorMembership.role as string)
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows } = await sb
    .from("agent_assignments")
    .select(
      "id, assigned_to_user_id, assigned_by_user_id, assignment_note, assigned_at",
    )
    .eq("template_id", templateId)
    .eq("status", "active");

  return NextResponse.json({ assignments: rows ?? [] });
}
