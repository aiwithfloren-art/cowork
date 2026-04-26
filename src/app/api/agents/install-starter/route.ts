import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { STARTER_TEMPLATES, wrapStarterRole } from "@/lib/starter-kit";

export const runtime = "nodejs";

/**
 * Install a starter template as a custom_agent for the signed-in user.
 *
 * Why this exists separately from create_ai_employee tool:
 *   - One-click activation from the /agents page (Marketplace UX)
 *   - Skips the chat-based clarify/confirm flow (which is overkill when
 *     the user explicitly picked "install Coder" from a card)
 *   - Pulls verbatim from STARTER_TEMPLATES so prompts/tools stay in sync
 *     with code changes (no DB drift)
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { template_name } = (await req.json()) as { template_name?: string };
  if (!template_name) {
    return NextResponse.json(
      { error: "template_name required" },
      { status: 400 },
    );
  }

  const tmpl = STARTER_TEMPLATES.find(
    (t) => t.name.toLowerCase() === template_name.toLowerCase(),
  );
  if (!tmpl) {
    return NextResponse.json(
      { error: `Template '${template_name}' not found` },
      { status: 404 },
    );
  }

  const sb = supabaseAdmin();

  // Generate unique slug — kebab-case of template name, retry with random
  // suffix on collision (user might re-install).
  const baseSlug = tmpl.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: dup } = await sb
      .from("custom_agents")
      .select("id")
      .eq("user_id", userId)
      .eq("slug", slug)
      .maybeSingle();
    if (!dup) break;
    slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
  }

  const { data: inserted, error } = await sb
    .from("custom_agents")
    .insert({
      user_id: userId,
      slug,
      name: tmpl.name,
      emoji: tmpl.emoji ?? null,
      description: tmpl.description ?? null,
      system_prompt: wrapStarterRole(tmpl.role),
      enabled_tools: tmpl.enabled_tools ?? [],
      objectives: tmpl.objectives ?? [],
      llm_override_provider: tmpl.llm_override_provider ?? null,
      llm_override_model: tmpl.llm_override_model ?? null,
      schedule_cron: tmpl.default_schedule ?? null,
    })
    .select("slug")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slug: inserted.slug });
}
