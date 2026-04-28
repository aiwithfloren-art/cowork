import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seedStarterSkills } from "@/lib/starter-kit";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Finalizes the Path-A (new team) onboarding wizard. Runs in one shot at
 * the end so the wizard can live entirely client-side until submit:
 *   1. Mark user as onboarded
 *   2. Create org (with derived slug)
 *   3. Add user as owner
 *   4. Save company context (description + brand_tone from wizard)
 *   5. Seed starter skill templates into the new org
 *   6. Activate the selected starter employee for the owner (if any)
 *
 * Returns the slug of the activated employee so client can navigate to
 * /agents/<slug> and land on a working chat page.
 */

const MAX_ORG_NAME = 60;
const MAX_DESC = 2000;
const MAX_TONE = 300;

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "team") + "-" + crypto.randomBytes(3).toString("hex");
}

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    org_name?: string;
    description?: string;
    brand_tone?: string;
    starter_template_name?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgName = (body.org_name ?? "").trim().slice(0, MAX_ORG_NAME);
  if (!orgName) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const description = (body.description ?? "").trim().slice(0, MAX_DESC);
  const brandTone = (body.brand_tone ?? "").trim().slice(0, MAX_TONE);

  const sb = supabaseAdmin();

  // 1. Mark user onboarded (idempotent)
  await sb.from("user_settings").upsert({
    user_id: uid,
    onboarded_at: new Date().toISOString(),
  });

  // 2. Create org
  const slug = slugifyName(orgName);
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({
      name: orgName,
      slug,
      owner_id: uid,
      description: description || null,
      brand_tone: brandTone || null,
      tier: "team",
    })
    .select("id")
    .single();
  if (orgErr || !org) {
    return NextResponse.json(
      { error: orgErr?.message || "Failed to create team" },
      { status: 500 },
    );
  }

  // 3. Owner membership
  await sb.from("org_members").insert({
    org_id: org.id,
    user_id: uid,
    role: "owner",
    share_with_manager: true,
  });

  // 4. Seed starter skills into the new org
  try {
    await seedStarterSkills(org.id);
  } catch (e) {
    console.error(
      "[onboarding/finalize] starter-kit seed failed:",
      e instanceof Error ? e.message : e,
    );
  }

  // 5. Auto-install the 3 high-value agents (Lead Gen, Content Creator,
  // Coder) so user can demo multi-agent flow immediately. Wizard no
  // longer asks user to pick — we install the workhorse trio by default.
  // If wizard explicitly passes starter_template_name, we ALSO install
  // that one (for back-compat).
  const autoInstallNames = new Set([
    "Lead Gen",
    "Content Creator",
    "Coder",
  ]);
  if (body.starter_template_name) {
    autoInstallNames.add(body.starter_template_name);
  }

  let activatedSlug: string | null = null;
  const { data: tmpls } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, description, system_prompt, enabled_tools, objectives, llm_override_provider, llm_override_model",
    )
    .eq("org_id", org.id)
    .in("name", [...autoInstallNames]);

  for (const tmpl of tmpls ?? []) {
    const agentSlug =
      (tmpl.name as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      crypto.randomBytes(2).toString("hex");

    const { data: created } = await sb
      .from("custom_agents")
      .insert({
        user_id: uid,
        slug: agentSlug,
        name: tmpl.name,
        emoji: tmpl.emoji,
        description: tmpl.description,
        system_prompt: tmpl.system_prompt,
        enabled_tools: tmpl.enabled_tools ?? [],
        objectives: tmpl.objectives ?? [],
        llm_override_provider: tmpl.llm_override_provider,
        llm_override_model: tmpl.llm_override_model,
      })
      .select("slug")
      .single();
    if (created && tmpl.name === (body.starter_template_name ?? "Lead Gen")) {
      // Land user on this agent after onboarding (Lead Gen by default,
      // or whatever they explicitly picked).
      activatedSlug = created.slug as string;
    }
    await sb
      .from("org_agent_templates")
      .update({ install_count: 1 })
      .eq("id", tmpl.id);
  }

  return NextResponse.json({
    ok: true,
    org_id: org.id,
    activated_slug: activatedSlug,
  });
}
