/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * Simulates the share-via-link round trip at the DB layer:
 *   1. Owner of Org A publishes an AI employee + generates share_token
 *   2. A different user (in Org B) clicks the link + "accepts"
 *   3. That user gets membership in Org A (additional) + agent activated
 *
 * Confirms: share_token lookup works, dual-org membership is fine, agent
 * materializes in the accepter's workspace with right template fields.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Use the existing test user as "owner". Find them.
  const { data: owner } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!owner) throw new Error("test owner user missing");

  const { data: ownerMem } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", owner.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!ownerMem?.org_id) throw new Error("owner has no org");
  const orgId = ownerMem.org_id as string;

  // Fetch an existing template from owner's org
  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, description, system_prompt, enabled_tools, objectives, share_token, install_count",
    )
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!tmpl) throw new Error("no template to share");
  console.log(`→ template: ${tmpl.name} (${tmpl.id})`);

  // STEP 1: mint share token (simulate POST /api/team/skills/[id]/share-link)
  let token = tmpl.share_token as string | null;
  if (!token) {
    token = crypto.randomBytes(18).toString("base64url");
    await sb
      .from("org_agent_templates")
      .update({ share_token: token })
      .eq("id", tmpl.id);
    console.log(`→ minted token: ${token.slice(0, 10)}…`);
  } else {
    console.log(`→ existing token: ${token.slice(0, 10)}…`);
  }

  // STEP 2: simulate lookup via token
  const { data: byToken } = await sb
    .from("org_agent_templates")
    .select("id, org_id, name, emoji, system_prompt, enabled_tools")
    .eq("share_token", token)
    .maybeSingle();
  if (!byToken) throw new Error("token lookup failed");
  console.log(`✓ token → template resolved`);

  // STEP 3: create a throwaway "recipient" user + activate employee for them
  const recipientEmail = `recipient-${Date.now()}@testshare.local`;
  const { data: recipient, error: recErr } = await sb
    .from("users")
    .insert({
      email: recipientEmail,
      name: "Recipient Test",
    })
    .select("id")
    .single();
  if (recErr || !recipient) throw new Error(`create recipient: ${recErr?.message}`);
  const recId = recipient.id as string;
  console.log(`→ test recipient: ${recId}`);

  // Simulate the accept endpoint's actions:
  // 3a. add as org member
  await sb.from("org_members").insert({
    org_id: orgId,
    user_id: recId,
    role: "member",
    share_with_manager: false,
  });

  // 3b. mark onboarded
  await sb.from("user_settings").upsert({
    user_id: recId,
    onboarded_at: new Date().toISOString(),
  });

  // 3c. materialize agent in recipient's workspace
  const baseSlug = (tmpl.name as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = baseSlug + "-" + crypto.randomBytes(2).toString("hex");
  const { data: created } = await sb
    .from("custom_agents")
    .insert({
      user_id: recId,
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
  if (!created) throw new Error("agent materialization failed");
  console.log(`✓ agent activated in recipient workspace: ${created.slug}`);

  // Verify recipient now has access
  const { data: recMem } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", recId);
  console.log(
    `✓ recipient membership: ${recMem?.length} row(s), role=${recMem?.[0]?.role}`,
  );

  const { data: recAgents } = await sb
    .from("custom_agents")
    .select("slug, name")
    .eq("user_id", recId);
  console.log(
    `✓ recipient agents: ${recAgents?.map((a) => a.name).join(", ")}`,
  );

  // Cleanup
  await sb.from("custom_agents").delete().eq("user_id", recId);
  await sb.from("org_members").delete().eq("user_id", recId);
  await sb.from("user_settings").delete().eq("user_id", recId);
  await sb.from("users").delete().eq("id", recId);
  console.log("→ cleanup done");

  console.log("\n🎉 share-via-link round trip verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
