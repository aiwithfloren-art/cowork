/* eslint-disable */
// One-off script to seed dummy calendar events + tasks for testing.
// Run: npx tsx scripts/seed-dummy.ts <user_email>

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
    .select("id, email")
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

  // Auto-persist refreshed tokens
  oauth2.on("tokens", async (t) => {
    if (t.access_token) {
      await sb
        .from("google_tokens")
        .update({
          access_token: t.access_token,
          expires_at: t.expiry_date ? new Date(t.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }
  });

  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const tasksApi = google.tasks({ version: "v1", auth: oauth2 });

  // ========== CALENDAR EVENTS ==========
  const TZ = "+07:00"; // WIB
  const today = new Date();
  const dateISO = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = dateISO(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = dateISO(tomorrow);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = dateISO(dayAfter);
  const friday = new Date(today);
  const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
  friday.setDate(friday.getDate() + daysUntilFriday);
  const fridayStr = dateISO(friday);

  const events = [
    {
      summary: "Team Standup",
      description: "Daily sync with the Cowork team.",
      start: { dateTime: `${todayStr}T09:00:00${TZ}` },
      end: { dateTime: `${todayStr}T09:30:00${TZ}` },
    },
    {
      summary: "1:1 with Budi",
      description: "Weekly check-in — career growth and project status.",
      start: { dateTime: `${todayStr}T11:00:00${TZ}` },
      end: { dateTime: `${todayStr}T12:00:00${TZ}` },
    },
    {
      summary: "Product Review",
      description: "Review latest Cowork features and roadmap.",
      location: "Google Meet",
      start: { dateTime: `${todayStr}T14:00:00${TZ}` },
      end: { dateTime: `${todayStr}T15:00:00${TZ}` },
    },
    {
      summary: "Deep Work — Cowork Launch Prep",
      description: "Focus block — no meetings.",
      start: { dateTime: `${todayStr}T16:00:00${TZ}` },
      end: { dateTime: `${todayStr}T17:30:00${TZ}` },
    },
    {
      summary: "Client Demo — Acme Corp",
      description: "Demo Cowork Team Mode to Acme stakeholders.",
      location: "Zoom",
      start: { dateTime: `${tomorrowStr}T10:00:00${TZ}` },
      end: { dateTime: `${tomorrowStr}T11:00:00${TZ}` },
    },
    {
      summary: "Design Review",
      description: "Review landing page and dashboard iterations.",
      start: { dateTime: `${tomorrowStr}T14:00:00${TZ}` },
      end: { dateTime: `${tomorrowStr}T15:30:00${TZ}` },
    },
    {
      summary: "Sprint Planning",
      description: "Plan next week's Cowork roadmap.",
      start: { dateTime: `${dayAfterStr}T15:00:00${TZ}` },
      end: { dateTime: `${dayAfterStr}T16:00:00${TZ}` },
    },
    {
      summary: "Investor Check-in",
      description: "Monthly update call.",
      start: { dateTime: `${fridayStr}T13:00:00${TZ}` },
      end: { dateTime: `${fridayStr}T13:45:00${TZ}` },
    },
  ];

  console.log(`\n📅 Creating ${events.length} calendar events…`);
  for (const e of events) {
    try {
      const res = await cal.events.insert({
        calendarId: "primary",
        requestBody: e,
      });
      console.log(`  ✓ ${e.summary} → ${res.data.htmlLink?.slice(0, 60)}...`);
    } catch (err) {
      console.error(`  ✗ ${e.summary}:`, (err as Error).message);
    }
  }

  // ========== TASKS ==========
  const listRes = await tasksApi.tasklists.list({ maxResults: 10 });
  const defaultList = listRes.data.items?.[0];
  if (!defaultList?.id) {
    console.log("\n⚠️ No task list found — skipping tasks");
    return;
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dateISO(yesterday);

  const tasks = [
    { title: "Review proposal from Acme", due: `${todayStr}T00:00:00.000Z`, notes: "Check pricing section and legal terms." },
    { title: "Reply to investor email", due: `${tomorrowStr}T00:00:00.000Z` },
    { title: "Prep slides for product review", due: `${todayStr}T00:00:00.000Z` },
    { title: "Launch Cowork to 10 friends", due: `${dayAfterStr}T00:00:00.000Z`, notes: "Post in Slack + WhatsApp groups." },
    { title: "Follow up with legal on privacy policy", due: `${yesterdayStr}T00:00:00.000Z`, notes: "OVERDUE — ping again today." },
    { title: "Update LinkedIn profile" },
    { title: "Research competitor pricing" },
    { title: "Write blog post: 'Building Cowork in 24 hours'" },
  ];

  console.log(`\n✅ Creating ${tasks.length} tasks…`);
  for (const t of tasks) {
    try {
      const res = await tasksApi.tasks.insert({
        tasklist: defaultList.id,
        requestBody: t,
      });
      const overdueTag = t.due && new Date(t.due) < today ? " [overdue]" : "";
      console.log(`  ✓ ${t.title}${overdueTag}`);
    } catch (err) {
      console.error(`  ✗ ${t.title}:`, (err as Error).message);
    }
  }

  console.log("\n🎉 Done! Refresh https://cowork-gilt.vercel.app/dashboard to see the data.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
