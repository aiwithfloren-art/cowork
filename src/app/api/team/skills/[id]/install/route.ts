import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "agent"
  );
}

const MAX_AGENTS_PER_USER = 20;

/**
 * Install an org skill template as a personal agent for the caller. The
 * install is a FORK — it copies the template's current spec into
 * custom_agents and the user can edit or delete it freely. Updates to the
 * source template do not propagate automatically.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  const { data: template } = await sb
    .from("org_agent_templates")
    .select(
      "id, org_id, name, emoji, description, system_prompt, enabled_tools, objectives, install_count",
    )
    .eq("id", id)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify the caller is a member of the template's org
  const { data: membership } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", template.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You must be a member of the publishing org to install" },
      { status: 403 },
    );
  }

  // Agent cap
  const { count } = await sb
    .from("custom_agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  if ((count ?? 0) >= MAX_AGENTS_PER_USER) {
    return NextResponse.json(
      {
        error: `You already have ${count} agents (max ${MAX_AGENTS_PER_USER}). Delete one first.`,
      },
      { status: 400 },
    );
  }

  // Generate a unique slug for the new agent under this user
  const baseSlug = slugify(template.name as string);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await sb
      .from("custom_agents")
      .select("id")
      .eq("user_id", uid)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  const { data: created, error } = await sb
    .from("custom_agents")
    .insert({
      user_id: uid,
      slug,
      name: template.name,
      emoji: template.emoji ?? null,
      description: template.description ?? null,
      system_prompt: template.system_prompt,
      enabled_tools: template.enabled_tools ?? [],
      objectives: template.objectives ?? [],
    })
    .select("slug, name, emoji")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Install failed" },
      { status: 500 },
    );
  }

  // Bump install counter (best-effort, don't fail on error)
  await sb
    .from("org_agent_templates")
    .update({ install_count: (template.install_count ?? 0) + 1 })
    .eq("id", id);

  return NextResponse.json({ ok: true, slug: created.slug });
}
