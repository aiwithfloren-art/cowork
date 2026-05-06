import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendAgentAssignedEmail } from "@/lib/email/client";

/**
 * Shared assignment logic — used both by /api/agents/template/[id]/assign
 * (admin assigning an already-published template) and by /api/agents/[slug]/
 * quick-assign (auto-publish + assign in one shot from personal agent
 * detail).
 *
 * For each target user:
 *   1. Skip if already actively assigned (idempotent)
 *   2. Validate target is a member of the same org
 *   3. Clone the template into their custom_agents (so the existing chat
 *      and runner pick it up unchanged) — tagged assigned_by_admin = true
 *   4. Insert audit row in agent_assignments
 *   5. In-app notification + email (best-effort)
 */

export type AssignResult = {
  user_id: string;
  status: "assigned" | "already" | "error";
  error?: string;
};

export async function assignTemplateToUsers(args: {
  template: {
    id: string;
    org_id: string;
    name: string;
    emoji: string | null;
    description: string | null;
    system_prompt: string;
    enabled_tools: string[] | null;
    objectives: string[] | null;
  };
  actor: { id: string; name?: string | null };
  userIds: string[];
  note: string | null;
}): Promise<AssignResult[]> {
  const sb = supabaseAdmin();
  const { template, actor, userIds, note } = args;

  // Validate target users are members of the same org.
  const { data: members } = await sb
    .from("org_members")
    .select("user_id")
    .eq("org_id", template.org_id)
    .in("user_id", userIds);
  const validUserIds = new Set(
    (members ?? []).map((m) => m.user_id as string),
  );

  const results: AssignResult[] = [];

  for (const targetUserId of userIds) {
    if (!validUserIds.has(targetUserId)) {
      results.push({
        user_id: targetUserId,
        status: "error",
        error: "Not a member of this org",
      });
      continue;
    }

    // Idempotent skip if already actively assigned.
    const { data: existing } = await sb
      .from("agent_assignments")
      .select("id")
      .eq("template_id", template.id)
      .eq("assigned_to_user_id", targetUserId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      results.push({ user_id: targetUserId, status: "already" });
      continue;
    }

    // Generate unique slug for clone.
    const baseSlug = template.name
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
      name: template.name,
      emoji: template.emoji ?? null,
      description: template.description ?? null,
      system_prompt: template.system_prompt,
      enabled_tools: template.enabled_tools ?? [],
      objectives: template.objectives ?? [],
      assigned_by_admin: true,
      source_template_id: template.id,
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
      org_id: template.org_id,
      template_id: template.id,
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
      body: `${template.emoji ?? "🤖"} ${template.name}${note ? ` — Note: ${note}` : ""}`,
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
          agentName: template.name,
          agentEmoji: template.emoji ?? "🤖",
          note,
          openUrl: `/skills/${slug}`,
        });
      }
    } catch (e) {
      console.error("[assign] email send failed:", e);
    }

    results.push({ user_id: targetUserId, status: "assigned" });
  }

  return results;
}

/**
 * Find existing org_agent_template for this user's agent slug, OR publish
 * the personal agent to org_agent_templates and return the new row. Used
 * by quick-assign so admins don't have to manually publish first.
 *
 * If a published template already exists with the same source_slug, we
 * snapshot-update it (refresh prompt + tools + objectives) so subsequent
 * assignees get the latest version. Existing assignees keep their cloned
 * copy (no auto-sync — same trade-off as the original publish flow).
 */
export async function findOrPublishTemplate(args: {
  ownerUserId: string;
  agentSlug: string;
}): Promise<
  | {
      ok: true;
      template: {
        id: string;
        org_id: string;
        name: string;
        emoji: string | null;
        description: string | null;
        system_prompt: string;
        enabled_tools: string[] | null;
        objectives: string[] | null;
      };
      published_now: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const sb = supabaseAdmin();

  // Load personal agent
  const { data: agent } = await sb
    .from("custom_agents")
    .select(
      "name, emoji, description, system_prompt, enabled_tools, objectives, assigned_by_admin",
    )
    .eq("user_id", args.ownerUserId)
    .eq("slug", args.agentSlug)
    .maybeSingle();
  if (!agent)
    return { ok: false, error: "Agent not found", status: 404 };
  if (agent.assigned_by_admin) {
    return {
      ok: false,
      error: "Cannot re-assign an agent that was assigned to you",
      status: 400,
    };
  }

  // Resolve actor's primary org + role
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", args.ownerUserId)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id)
    return {
      ok: false,
      error: "You must belong to an org to assign agents",
      status: 400,
    };
  if (!["owner", "manager"].includes(membership.role as string))
    return {
      ok: false,
      error: "Only owner / manager can assign",
      status: 403,
    };

  // Look for existing template (by source_slug) in this org
  const { data: existing } = await sb
    .from("org_agent_templates")
    .select(
      "id, org_id, name, emoji, description, system_prompt, enabled_tools, objectives",
    )
    .eq("org_id", membership.org_id)
    .eq("source_slug", args.agentSlug)
    .maybeSingle();

  if (existing) {
    // Refresh-snapshot so newly-assigned employees get the latest prompt.
    await sb
      .from("org_agent_templates")
      .update({
        name: agent.name,
        emoji: agent.emoji,
        description: agent.description,
        system_prompt: agent.system_prompt,
        enabled_tools: agent.enabled_tools ?? [],
        objectives: agent.objectives ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return {
      ok: true,
      template: {
        ...existing,
        name: agent.name as string,
        emoji: (agent.emoji as string | null) ?? null,
        description: (agent.description as string | null) ?? null,
        system_prompt: agent.system_prompt as string,
        enabled_tools: (agent.enabled_tools as string[] | null) ?? [],
        objectives: (agent.objectives as string[] | null) ?? [],
      },
      published_now: false,
    };
  }

  // Insert new published template
  const { data: inserted, error } = await sb
    .from("org_agent_templates")
    .insert({
      org_id: membership.org_id,
      published_by: args.ownerUserId,
      source_slug: args.agentSlug,
      name: agent.name,
      emoji: agent.emoji,
      description: agent.description,
      system_prompt: agent.system_prompt,
      enabled_tools: agent.enabled_tools ?? [],
      objectives: agent.objectives ?? [],
    })
    .select(
      "id, org_id, name, emoji, description, system_prompt, enabled_tools, objectives",
    )
    .single();
  if (error || !inserted)
    return {
      ok: false,
      error: `Publish failed: ${error?.message ?? "unknown"}`,
      status: 500,
    };

  return {
    ok: true,
    template: {
      id: inserted.id as string,
      org_id: inserted.org_id as string,
      name: inserted.name as string,
      emoji: (inserted.emoji as string | null) ?? null,
      description: (inserted.description as string | null) ?? null,
      system_prompt: inserted.system_prompt as string,
      enabled_tools: (inserted.enabled_tools as string[] | null) ?? [],
      objectives: (inserted.objectives as string[] | null) ?? [],
    },
    published_now: true,
  };
}
