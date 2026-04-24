import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { getLLMForUser } from "@/lib/llm/providers";
import { generateText } from "ai";
import { sendWeeklyReportEmail } from "@/lib/email/client";

export const runtime = "nodejs";
export const maxDuration = 300;

// Called by Vercel Cron on Fridays at 17:00 Asia/Jakarta (10:00 UTC)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // Get all users who have google tokens (active)
  const { data: users } = await sb
    .from("google_tokens")
    .select("user_id, users(id, email, name, timezone)");

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  let sent = 0;
  let errors = 0;

  for (const row of users) {
    const u = (row as unknown as {
      user_id: string;
      users: { id: string; email: string; name: string; timezone: string } | null;
    }).users;
    if (!u?.email) continue;

    try {
      const [events, tasks] = await Promise.all([
        getEvents(u.id, weekStart, now),
        listTasks(u.id),
      ]);

      const llm = await getLLMForUser(u.id);
      const prompt = `Generate a friendly weekly report for ${u.name || u.email} based on this data:

Calendar events this past week (${events.length} total):
${events.map((e) => `- ${e.title} (${e.start})`).join("\n") || "(none)"}

Open tasks right now (${tasks.length} total):
${tasks.map((t) => `- ${t.title}${t.due ? ` [due ${t.due}]` : ""}`).join("\n") || "(none)"}

Write a concise HTML report (NO <html> or <body> tags, just inner content with <p>, <ul>, <li>, <strong>). Include:
1. A warm one-line intro
2. What they accomplished (what meetings happened)
3. What's still on their plate
4. One encouraging/actionable closing suggestion

Keep it under 200 words. Use Bahasa Indonesia or English depending on their name style.`;

      const result = await generateText({
        model: llm.model,
        prompt,
      });

      const weekStartISO = weekStart.toISOString().slice(0, 10);
      await sb.from("weekly_reports").upsert({
        user_id: u.id,
        week_start: weekStartISO,
        content: result.text,
        sent_at: new Date().toISOString(),
      });

      const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

      await sendWeeklyReportEmail({
        to: u.email,
        name: u.name || u.email.split("@")[0],
        reportHtml: result.text,
        weekLabel,
      });

      sent++;
    } catch (e) {
      console.error(`weekly report failed for ${u.email}:`, e);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, sent, errors, total: users.length });
}
