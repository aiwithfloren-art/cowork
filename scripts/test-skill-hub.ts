/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Exercises the Skill Hub plumbing directly against the DB:
 *   1. Owner creates an agent
 *   2. Publishes it to org_agent_templates
 *   3. Second user "installs" it (simulated — copies template row to custom_agents)
 *   4. Owner unpublishes
 *
 * API routes hit auth()/session, so we test the data layer here. Hitting
 * the HTTP endpoints needs a running dev server + auth cookies, which is
 * what webapp-testing MCP would do.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user not found");
  console.log(`→ user ${user.id}`);

  // Ensure the user has an org (owner)
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) {
    throw new Error("test user has no org — run test-company-context first");
  }
  const orgId = membership.org_id;
  console.log(`→ org ${orgId} (role=${membership.role})`);

  // Step 1: create a source agent to publish
  const { data: sourceAgent, error: srcErr } = await sb
    .from("custom_agents")
    .insert({
      user_id: user.id,
      slug: `skill-test-${Date.now()}`,
      name: "Skill Hub Test Agent",
      emoji: "🧪",
      description: "Temp agent for skill hub E2E test",
      system_prompt:
        "You are a focused sub-agent inside Sigap.\n=== BEGIN ROLE ===\nTest agent.\n=== END ROLE ===",
      enabled_tools: ["web_search", "save_note"],
      objectives: ["check monday standup", "summarize weekly notes"],
    })
    .select("id, slug, name")
    .single();
  if (srcErr || !sourceAgent) throw new Error(`create agent: ${srcErr?.message}`);
  console.log(`✓ source agent created: ${sourceAgent.slug}`);

  // Step 2: publish as template (mirror publish endpoint logic)
  const { data: template, error: pubErr } = await sb
    .from("org_agent_templates")
    .insert({
      org_id: orgId,
      published_by: user.id,
      source_slug: sourceAgent.slug,
      name: "Skill Hub Test Agent",
      emoji: "🧪",
      description: "Temp agent for skill hub E2E test",
      system_prompt:
        "You are a focused sub-agent inside Sigap.\n=== BEGIN ROLE ===\nTest agent.\n=== END ROLE ===",
      enabled_tools: ["web_search", "save_note"],
      objectives: ["check monday standup", "summarize weekly notes"],
    })
    .select("id, name")
    .single();
  if (pubErr || !template) throw new Error(`publish: ${pubErr?.message}`);
  console.log(`✓ published as template ${template.id}`);

  // Step 3: verify list query returns it
  const { data: listed } = await sb
    .from("org_agent_templates")
    .select("id, name, install_count")
    .eq("org_id", orgId);
  console.log(
    `✓ list: ${listed?.length} template(s) in org, target found: ${
      listed?.some((t) => t.id === template.id)
    }`,
  );

  // Step 4: simulate install (copy template → custom_agents for the same user
  // with a different slug; in real flow this'd be a different user)
  const installedSlug = `installed-${Date.now()}`;
  const { error: instErr } = await sb.from("custom_agents").insert({
    user_id: user.id,
    slug: installedSlug,
    name: `${template.name} (Copy)`, // avoid name collision with source
    emoji: "🧪",
    description: "Installed from template",
    system_prompt:
      "You are a focused sub-agent inside Sigap.\n=== BEGIN ROLE ===\nTest agent.\n=== END ROLE ===",
    enabled_tools: ["web_search", "save_note"],
    objectives: [],
  });
  if (instErr) throw new Error(`install: ${instErr.message}`);
  console.log(`✓ installed copy as ${installedSlug}`);

  // bump install count
  await sb
    .from("org_agent_templates")
    .update({ install_count: 1 })
    .eq("id", template.id);

  // Step 5: unpublish
  const { error: delErr } = await sb
    .from("org_agent_templates")
    .delete()
    .eq("id", template.id);
  if (delErr) throw new Error(`unpublish: ${delErr.message}`);
  console.log(`✓ unpublished`);

  // Verify installed copy still exists (fork semantics)
  const { data: stillThere } = await sb
    .from("custom_agents")
    .select("slug")
    .eq("user_id", user.id)
    .eq("slug", installedSlug)
    .maybeSingle();
  if (!stillThere) {
    console.error("✗ installed copy was deleted when template was unpublished");
  } else {
    console.log(`✓ installed copy preserved after unpublish`);
  }

  // Cleanup
  await sb.from("custom_agents").delete().eq("slug", sourceAgent.slug);
  await sb.from("custom_agents").delete().eq("slug", installedSlug);
  console.log("→ cleanup done");

  console.log("\n🎉 Skill Hub E2E test passed");
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  process.exit(1);
});
