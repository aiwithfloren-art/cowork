import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Path-B: user is joining an existing org (either via domain match or
 * accepted invite). Inserts the membership, marks onboarded, auto-activates
 * any org_agent_templates flagged auto_deploy.
 *
 * POST { org_id } — user confirms domain-match join
 *       Automatic role="member", share_with_manager=false.
 */
export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const email = session?.user?.email;
  if (!uid || !email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { org_id } = (await req.json()) as { org_id?: string };
  if (!org_id)
    return NextResponse.json({ error: "org_id required" }, { status: 400 });

  const sb = supabaseAdmin();

  // Confirm the org exists AND at least one existing member shares email
  // domain — otherwise refuse (prevents random users joining any org).
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { data: orgMembers } = await sb
    .from("org_members")
    .select("user_id")
    .eq("org_id", org_id);
  const memberIds = (orgMembers ?? []).map((m) => m.user_id as string);
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  const { data: existingUsers } = await sb
    .from("users")
    .select("email")
    .in("id", memberIds);
  const domainMatches = (existingUsers ?? []).some((u) =>
    (u.email as string).toLowerCase().endsWith("@" + domain),
  );
  if (!domainMatches) {
    return NextResponse.json(
      { error: "Your email domain doesn't match this team" },
      { status: 403 },
    );
  }

  // Insert membership (idempotent via upsert on primary key)
  await sb.from("org_members").upsert({
    org_id,
    user_id: uid,
    role: "member",
    share_with_manager: false,
  });

  // Mark onboarded
  await sb.from("user_settings").upsert({
    user_id: uid,
    onboarded_at: new Date().toISOString(),
  });

  // Auto-deploy templates: activate any template marked auto_deploy for
  // this new member.
  const { data: autoTemplates } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, description, system_prompt, enabled_tools, objectives",
    )
    .eq("org_id", org_id)
    .eq("auto_deploy", true);

  const installedSlugs: string[] = [];
  for (const tmpl of autoTemplates ?? []) {
    const baseSlug = (tmpl.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = baseSlug + "-" + crypto.randomBytes(2).toString("hex");
    const { data: created } = await sb
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
    if (created) installedSlugs.push(created.slug as string);
  }

  return NextResponse.json({
    ok: true,
    org_id,
    auto_deployed: installedSlugs,
  });
}
