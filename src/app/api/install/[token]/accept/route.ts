import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Accepts a share-via-link install. Authenticated user clicks "Activate"
 * on the /install/<token> landing; this endpoint:
 *   1. Joins them as member of the template's org (if not already)
 *   2. Marks them onboarded
 *   3. Activates the employee in their personal workspace (copies template
 *      → custom_agents)
 * Returns the slug of the new agent so client can redirect to its chat.
 *
 * If already same-org AND agent with same name already exists: idempotent
 * no-op, returns the existing slug.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select(
      "id, org_id, name, emoji, description, system_prompt, enabled_tools, objectives, install_count",
    )
    .eq("share_token", token)
    .maybeSingle();
  if (!tmpl) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  // Membership — upsert as member (or leave existing role untouched)
  const { data: existing } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", tmpl.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!existing) {
    await sb.from("org_members").insert({
      org_id: tmpl.org_id,
      user_id: uid,
      role: "member",
      share_with_manager: false,
    });
  }

  // Mark onboarded
  await sb.from("user_settings").upsert({
    user_id: uid,
    onboarded_at: new Date().toISOString(),
  });

  // If agent with this name already exists in user's workspace → idempotent
  const { data: already } = await sb
    .from("custom_agents")
    .select("slug")
    .eq("user_id", uid)
    .eq("name", tmpl.name)
    .maybeSingle();
  if (already) {
    return NextResponse.json({
      ok: true,
      slug: already.slug as string,
      already_installed: true,
    });
  }

  const baseSlug = (tmpl.name as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = baseSlug + "-" + crypto.randomBytes(2).toString("hex");

  const { data: created, error } = await sb
    .from("custom_agents")
    .insert({
      user_id: uid,
      slug,
      name: tmpl.name,
      emoji: tmpl.emoji,
      description: tmpl.description,
      system_prompt: tmpl.system_prompt,
      enabled_tools: tmpl.enabled_tools ?? [],
      objectives: tmpl.objectives ?? [],
    })
    .select("slug")
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "Activation failed" },
      { status: 500 },
    );
  }

  await sb
    .from("org_agent_templates")
    .update({
      install_count: ((tmpl.install_count as number | null) ?? 0) + 1,
    })
    .eq("id", tmpl.id);

  return NextResponse.json({ ok: true, slug: created.slug as string });
}
