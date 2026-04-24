import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTodayEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { getLLMForUser } from "@/lib/llm/providers";
import { generateText } from "ai";
import { Resend } from "resend";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const maxDuration = 300;

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "Sigap <onboarding@resend.dev>";

// Vercel Cron: daily at 00:00 UTC (07:00 WIB)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: users } = await sb
    .from("google_tokens")
    .select("user_id, users(id, email, name)");

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let sent = 0;
  let errors = 0;

  for (const row of users) {
    const u = (row as unknown as {
      users: { id: string; email: string; name: string | null } | null;
    }).users;
    if (!u?.email) continue;

    try {
      const [events, tasks] = await Promise.all([
        getTodayEvents(u.id),
        listTasks(u.id),
      ]);

      if (events.length === 0 && tasks.length === 0) {
        // Skip empty days — don't spam user
        continue;
      }

      const overdue = tasks.filter(
        (t) => t.due && new Date(t.due) < new Date(),
      );

      const context = {
        name: u.name || u.email.split("@")[0],
        today_events: events.map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
        })),
        open_tasks: tasks.map((t) => ({ title: t.title, due: t.due })),
        overdue_count: overdue.length,
      };

      const llm = await getLLMForUser(u.id);
      const { text } = await generateText({
        model: llm.model,
        system:
          "You write short, warm morning briefings. Output CLEAN HTML (no <html> tag, just inner content). Use <p>, <ul>, <li>, <strong>. Tone: friendly, actionable. Max 150 words. Detect language from user's name (Indonesian-sounding name → Bahasa Indonesia, else English).",
        prompt: `Write a morning briefing for ${context.name}:

Today's events (${context.today_events.length}):
${JSON.stringify(context.today_events, null, 2)}

Open tasks (${context.open_tasks.length}, ${context.overdue_count} overdue):
${JSON.stringify(context.open_tasks, null, 2)}

Structure:
1. Warm one-line greeting
2. Schedule summary with top priorities
3. One actionable suggestion for the day
4. Closing encouragement`,
      });

      const todayLabel = new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Asia/Jakarta",
      });

      const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #6366f1, #22d3ee); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
  <p style="color: #64748b; font-size: 12px; margin-bottom: 4px;">☀️ ${todayLabel}</p>
  <h1 style="color: #0f172a; font-size: 22px; margin: 0 0 16px;">Good morning, ${escapeHtml(context.name)}</h1>
  <div style="color: #0f172a; line-height: 1.65; font-size: 15px;">
    ${text}
  </div>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  <p style="color: #64748b; font-size: 13px;">
    <a href="${getAppUrl()}/dashboard" style="color: #6366f1;">Open Sigap dashboard →</a>
  </p>
  <p style="color: #94a3b8; font-size: 11px;">Sent by Sigap. <a href="${getAppUrl()}/settings" style="color: #94a3b8;">Manage settings</a>.</p>
</div>`;

      await resend.emails.send({
        from: FROM,
        to: u.email,
        subject: `☀️ Your Sigap briefing — ${todayLabel}`,
        html,
      });

      sent++;
    } catch (e) {
      console.error(`morning briefing failed for ${u.email}:`, e);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, sent, errors, total: users.length });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
