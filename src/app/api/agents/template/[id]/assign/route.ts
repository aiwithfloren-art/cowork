import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendAgentAssignedEmail } from "@/lib/email/client";

export const runtime = "nodejs";

/**
 * Admin assigns a published org_agent_template to one or more employees.
 *
 * On each assignment we:
 *   1. Insert audit row in agent_assignments
 *   2. Clone the template into the employee's custom_agents (so the
 *      existing chat/runner infrastructure picks it up unchanged) —
 *      tagged with assigned_by_admin = true to block self-delete
 *   3. Insert in-app notification
 *   4. Send email (best-effort; failure does not roll back the assignment)
 *
 * Skipped silently if the template is already actively assigned to that
 * user (idempotent re-assign).
 */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const actor = (session?.user as { id?: string; name?: string; email?: string } | undefined);
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

  // Verify actor is owner/manager AND the template is in their org.
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
    .select("role, org_id")
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

  // Validate target users are members of the same org.
  const { data: targetMembers } = await sb
    .from("org_members")
    .select("user_id")
    .eq("org_id", tmpl.org_id)
    .in("user_id", userIds);
  const validUserIds = new Set(
    (targetMembers ?? []).map((m) => m.user_id as string),
  );

  const results: Array<{
    user_id: string;
    status: "assigned" | "already" | "error";
    error?: string;
  }> = [];

  for (const targetUserId of userIds) {
    if (!validUserIds.has(targetUserId)) {
      results.push({
        user_id: targetUserId,
        status: "error",
        error: "Not a member of this org",
      });
      continue;
    }

    // Already actively assigned? — idempotent skip.
    const { data: existing } = await sb
      .from("agent_assignments")
      .select("id")
      .eq("template_id", templateId)
      .eq("assigned_to_user_id", targetUserId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      results.push({ user_id: targetUserId, status: "already" });
      continue;
    }

    // Generate unique slug for clone (kebab-case + retry on collision).
    const baseSlug = (tmpl.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await sb
        .from("custom_agents")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("slug", slug)
        .maybeSingle();
      if (!dup) break;
      slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
    }

    const { error: cloneErr } = await sb.from("custom_agents").insert({
      user_id: targetUserId,
      slug,
      name: tmpl.name,
      emoji: tmpl.emoji ?? null,
      description: tmpl.description ?? null,
      system_prompt: tmpl.system_prompt,
      enabled_tools: tmpl.enabled_tools ?? [],
      objectives: tmpl.objectives ?? [],
      assigned_by_admin: true,
      source_template_id: tmpl.id,
    });
    if (cloneErr) {
      results.push({
        user_id: targetUserId,
        status: "error",
        error: cloneErr.message,
      });
      continue;
    }

    const { error: assignErr } = await sb.from("agent_assignments").insert({
      org_id: tmpl.org_id,
      template_id: tmpl.id,
      assigned_to_user_id: targetUserId,
      assigned_by_user_id: actor.id,
      assignment_note: note,
      cloned_agent_slug: slug,
      status: "active",
    });
    if (assignErr) {
      // Roll back the clone if audit insert fails.
      await sb
        .from("custom_agents")
        .delete()
        .eq("user_id", targetUserId)
        .eq("slug", slug);
      results.push({
        user_id: targetUserId,
        status: "error",
        error: assignErr.message,
      });
      continue;
    }

    // In-app notification.
    await sb.from("notifications").insert({
      user_id: targetUserId,
      actor_id: actor.id,
      kind: "agent_assigned",
      title: `${actor.name ?? "Admin"} assigned an agent to you`,
      body: `${tmpl.emoji ?? "🤖"} ${tmpl.name}${note ? ` — Note: ${note}` : ""}`,
      link: `/skills/${slug}`,
    });

    // Email (best-effort).
    try {
      const { data: targetUser } = await sb
        .from("users")
        .select("email, name")
        .eq("id", targetUserId)
        .maybeSingle();
      if (targetUser?.email) {
        await sendAgentAssignedEmail({
          to: targetUser.email as string,
          recipientName: (targetUser.name as string | null) ?? "there",
          adminName: actor.name ?? "Admin",
          agentName: tmpl.name,
          agentEmoji: (tmpl.emoji as string | null) ?? "🤖",
          note,
          openUrl: `/skills/${slug}`,
        });
      }
    } catch (e) {
      console.error("[assign] email send failed:", e);
    }

    results.push({ user_id: targetUserId, status: "assigned" });
  }

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

  // Delete the cloned custom_agent (if it still exists).
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
