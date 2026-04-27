/* eslint-disable */
// One-shot: insert "Lead Gen" template into every existing org's
// org_agent_templates table so existing users see the new agent in
// the marketplace. New orgs created after this point auto-seed via
// seedStarterSkills().
//
// Run: npx tsx scripts/backfill-lead-gen.ts

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { STARTER_TEMPLATES, wrapStarterRole } from "../src/lib/starter-kit";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const tmpl = STARTER_TEMPLATES.find((t) => t.name === "Lead Gen");
  if (!tmpl) throw new Error("Lead Gen template not found in starter-kit.ts");

  // Get all orgs
  const { data: orgs, error: orgErr } = await sb
    .from("organizations")
    .select("id");
  if (orgErr) throw orgErr;

  let inserted = 0;
  let skipped = 0;
  for (const org of orgs ?? []) {
    // Skip if already exists (idempotent)
    const { data: existing } = await sb
      .from("org_agent_templates")
      .select("id")
      .eq("org_id", org.id)
      .eq("name", tmpl.name)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await sb.from("org_agent_templates").insert({
      org_id: org.id,
      name: tmpl.name,
      emoji: tmpl.emoji,
      description: tmpl.description,
      system_prompt: wrapStarterRole(tmpl.role),
      enabled_tools: tmpl.enabled_tools,
      objectives: tmpl.objectives,
      llm_override_provider: tmpl.llm_override_provider ?? null,
      llm_override_model: tmpl.llm_override_model ?? null,
      default_schedule: tmpl.default_schedule ?? null,
    });
    if (error) {
      console.error(`✗ org ${org.id}: ${error.message}`);
      continue;
    }
    inserted++;
  }

  console.log(`✓ Lead Gen template: ${inserted} orgs inserted, ${skipped} skipped (already existed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
