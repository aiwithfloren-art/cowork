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

  // ========== NOTES (Supabase) ==========
  const notes = [
    "Ide fitur: reminder otomatis kalo task overdue > 3 hari, kirim ke Telegram.",
    "Pricing Acme: $2k/bulan flat untuk 10 seat. Mereka push diskon 20% kalo annual.",
    "Investor update draft — highlight: 200 beta users, retention 40% W4, revenue $1.2k MRR.",
    "Feedback dari Budi (1:1): butuh lebih banyak async komunikasi, meeting terlalu padat Selasa-Kamis.",
    "Competitor pricing — Reclaim: $10/mo, Motion: $19/mo, Superhuman: $30/mo. Kita sweet spot di $8.",
    "Launch checklist: (1) bikin Product Hunt draft, (2) DM 10 temen dekat, (3) post LinkedIn Jumat 21:00.",
    "Quote dari pelanggan Acme: 'kayak punya chief of staff tapi 1/100 harganya' — pake buat testimonial.",
    "Blog post outline: Building Cowork in 24 hours — fokus ke tooling (Next 16, Groq, Supabase), bukan ke hype.",
  ];

  console.log(`\n📝 Creating ${notes.length} notes…`);
  const noteRows = notes.map((content, i) => ({
    user_id: user.id,
    content,
    created_at: new Date(today.getTime() - (notes.length - i) * 3600_000).toISOString(),
  }));
  const { error: notesErr } = await sb.from("notes").insert(noteRows);
  if (notesErr) console.error("  ✗", notesErr.message);
  else console.log(`  ✓ inserted ${notes.length} notes`);

  // ========== CHAT HISTORY (Supabase) ==========
  const baseTime = today.getTime() - 2 * 86400_000; // 2 days ago
  const chatMessages: Array<{
    user_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }> = [];
  const convo = [
    ["user", "apa aja yang harus gue siapin buat demo Acme besok?"],
    ["assistant", "Berdasarkan notes kamu: (1) pricing $2k/bulan flat — siapin jawaban buat pushback diskon 20% annual, (2) tekanin Team Mode karena itu yang mereka tanya, (3) bawa testimonial dari customer existing. Demo dijadwal jam 10:00 di Zoom."],
    ["user", "bikin task reminder buat prep slide besok pagi"],
    ["assistant", "Done. Task 'Prep slides for product review' udah ada deadline hari ini, saya tambahin satu lagi: 'Final review Acme deck' deadline besok pagi 08:00."],
    ["user", "investor update udah sampe mana?"],
    ["assistant", "Draft-nya ada di notes kamu — highlight 200 beta users, retention 40% W4, MRR $1.2k. Belum dikirim. Email dari investor terakhir masuk 3 hari lalu, subject 'Q1 check-in?' — mereka nanyain metrics."],
  ];
  convo.forEach(([role, content], i) => {
    chatMessages.push({
      user_id: user.id,
      role: role as "user" | "assistant",
      content,
      created_at: new Date(baseTime + i * 90_000).toISOString(),
    });
  });
  const yesterdayBase = today.getTime() - 86400_000;
  const convo2 = [
    ["user", "ringkas meeting 1:1 sama Budi kemarin"],
    ["assistant", "Dari notes: Budi kasih feedback butuh lebih banyak async comms, meeting terlalu padat Selasa-Kamis. Saran saya: blok 'no meeting Wednesday' dan pindahin standup jadi async di Slack threads."],
    ["user", "save ide itu ke notes"],
    ["assistant", "Tersimpan di notes: 'No Meeting Wednesday + async standup di Slack thread — respons Budi 1:1'."],
  ];
  convo2.forEach(([role, content], i) => {
    chatMessages.push({
      user_id: user.id,
      role: role as "user" | "assistant",
      content,
      created_at: new Date(yesterdayBase + i * 90_000).toISOString(),
    });
  });

  console.log(`\n💬 Creating ${chatMessages.length} chat messages…`);
  const { error: chatErr } = await sb.from("chat_messages").insert(chatMessages);
  if (chatErr) console.error("  ✗", chatErr.message);
  else console.log(`  ✓ inserted ${chatMessages.length} chat messages across 2 sessions`);

  console.log("\n🎉 Done! Refresh https://cowork-gilt.vercel.app/dashboard to see the data.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
