/* eslint-disable */
// One-off: insert a pre-obtained Slack bot token directly into the
// connectors table so the user can test immediately without running
// through /api/connectors/slack/install first. The install flow will
// still work for future users once env vars are set in Vercel.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EMAIL = process.argv[2] || "aiwithfloren@gmail.com";
const BOT_TOKEN = process.argv[3];
if (!BOT_TOKEN) {
  console.error("usage: npx tsx scripts/insert-slack-token.ts <email> <xoxb-token>");
  process.exit(1);
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: user } = await sb
    .from("users")
    .select("id, name, email")
    .eq("email", EMAIL)
    .maybeSingle();
  if (!user) throw new Error(`user ${EMAIL} not found`);

  // Ask Slack for team info so we store a proper label
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

  const { error } = await sb.from("connectors").upsert(
    {
      user_id: user.id,
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
  if (error) throw new Error(error.message);

  console.log(`✓ Slack connected for ${user.name} (${EMAIL})`);
  console.log(`  workspace: ${info.team} (${info.team_id})`);
  console.log(`  bot user:  ${info.user}`);
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
