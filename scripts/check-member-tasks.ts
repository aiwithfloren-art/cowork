/* eslint-disable */
// Query a user's Google Tasks directly via their OAuth token.
// Usage: npx tsx scripts/check-member-tasks.ts <email>

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EMAIL = process.argv[2] || "aiwithfloren@gmail.com";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: user } = await sb
    .from("users")
    .select("id, email, name")
    .eq("email", EMAIL)
    .maybeSingle();
  if (!user) throw new Error(`User ${EMAIL} not found`);

  const { data: tokens } = await sb
    .from("google_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tokens) throw new Error(`No tokens for ${EMAIL}`);

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : undefined,
  });

  const tasksApi = google.tasks({ version: "v1", auth: oauth2 });
  const lists = await tasksApi.tasklists.list({ maxResults: 10 });
  const defaultList = lists.data.items?.[0];
  if (!defaultList?.id) {
    console.log("No task list.");
    return;
  }

  const res = await tasksApi.tasks.list({
    tasklist: defaultList.id,
    showCompleted: true,
    showHidden: true,
    maxResults: 100,
  });

  const items = res.data.items ?? [];
  console.log(`\n=== ${user.name}'s Google Tasks (${items.length} total) ===`);
  items
    .sort((a, b) => (a.updated || "").localeCompare(b.updated || ""))
    .reverse()
    .forEach((t) => {
      const status = t.status === "completed" ? "✅" : "⬜";
      const due = t.due ? ` [due ${t.due.slice(0, 10)}]` : "";
      console.log(`  ${status} ${t.title}${due}`);
      if (t.notes) console.log(`       ${t.notes.replace(/\n/g, " ").slice(0, 120)}`);
    });
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
