/* eslint-disable */
// Sets up the test org so Santi (manager) can query Budi (member) progress.
// Also re-inserts the Slack bot token onto Santi so the Slack Events webhook
// has a connector for the workspace.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SANTI_EMAIL = "aiwithfloren@gmail.com";
const BUDI_EMAIL = "humanevaluationofficial@gmail.com";
const BOT_TOKEN = process.argv[2] ?? process.env.SLACK_BOT_TOKEN;
if (!BOT_TOKEN || !BOT_TOKEN.startsWith("xoxb-")) {
  console.error(
    "usage: SLACK_BOT_TOKEN=xoxb-... npx tsx scripts/setup-test-org.ts\n   or: npx tsx scripts/setup-test-org.ts xoxb-...",
  );
  process.exit(1);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Resolve user IDs
  const { data: users } = await sb
    .from("users")
    .select("id, name, email")
    .in("email", [SANTI_EMAIL, BUDI_EMAIL]);
  const santi = users?.find((u) => u.email === SANTI_EMAIL);
  const budi = users?.find((u) => u.email === BUDI_EMAIL);
  if (!santi || !budi) throw new Error(`missing user — santi? ${!!santi}, budi? ${!!budi}`);
  console.log(`✓ santi: ${santi.name} (${santi.id})`);
  console.log(`✓ budi:  ${budi.name} (${budi.id})`);

  // Create org
  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .insert({ name: "Democorp Testing", slug: `democorp-test-${Date.now()}`, owner_id: santi.id })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`org create failed: ${orgErr?.message}`);
  console.log(`✓ org created: ${org.id}`);

  // Memberships
  const { error: memErr } = await sb.from("org_members").insert([
    {
      org_id: org.id,
      user_id: santi.id,
      role: "owner",
      share_with_manager: false,
    },
    {
      org_id: org.id,
      user_id: budi.id,
      role: "member",
      manager_id: santi.id,
      share_with_manager: true, // Budi opts in so Santi can query his progress
    },
  ]);
  if (memErr) throw new Error(`org_members failed: ${memErr.message}`);
  console.log(`✓ Santi=owner, Budi=member(manager=Santi, share_with_manager=true)`);

  // Re-insert Slack bot token on Santi so the Slack Events webhook has a
  // connector row to resolve team_id → bot token. Both users' Slack DMs still
  // work because we look up the Sigap user by Slack email, independent of
  // which Cowork user owns the connector.
  const authTest = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${BOT_TOKEN}` },
  });
  const info = (await authTest.json()) as {
    ok: boolean;
    error?: string;
    team?: string;
    team_id?: string;
    user?: string;
  };
  if (!info.ok) throw new Error(`slack auth.test failed: ${info.error}`);

  const { error: connErr } = await sb.from("connectors").upsert(
    {
      user_id: santi.id,
      provider: "slack",
      access_token: BOT_TOKEN,
      scope: "channels:read,chat:write,users:read,search:read.public",
      external_account_id: info.team_id ?? null,
      external_account_label: info.team ?? null,
      metadata: { direct_insert: true, bot_user: info.user ?? null },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (connErr) throw new Error(`connector upsert failed: ${connErr.message}`);
  console.log(`✓ Slack connector on Santi (workspace: ${info.team})`);

  console.log("\n✓ Test org setup complete.");
  console.log(`  santi_id=${santi.id}`);
  console.log(`  budi_id=${budi.id}`);
  console.log(`  org_id=${org.id}`);
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
