import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Kimi K2 (via Groq) is unreliable about actually calling start_meeting_bot —
 * it often responds "Bot sudah dikirim!" without invoking any tool, leaving
 * no row in meeting_bots. When the user's message clearly matches a record
 * intent with a meeting URL, bypass the LLM: hit the Attendee API directly
 * and return a canned reply.
 */

const MEETING_VERBS =
  /\b(rekam|record|join|dispatch)\s+(meeting|call)?/i;

const MEETING_URL_REGEX =
  /https?:\/\/(?:[a-z0-9-]+\.)?(zoom\.us|meet\.google\.com|teams\.(?:live|microsoft)\.com)\/[^\s<>"]+/i;

export async function tryInterceptMeetingRecord(
  userId: string,
  message: string,
): Promise<string | null> {
  const urlMatch = message.match(MEETING_URL_REGEX);
  if (!urlMatch) return null;
  const hasVerb = MEETING_VERBS.test(message);
  if (!hasVerb) return null;

  const apiKey = process.env.ATTENDEE_API_KEY;
  if (!apiKey) {
    return "⚠️ Meeting bot belum dikonfigurasi (ATTENDEE_API_KEY missing). Admin perlu set env var dulu.";
  }

  const meetingUrl = urlMatch[0];

  try {
    const res = await fetch("https://app.attendee.dev/api/v1/bots", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: "Sigap Notetaker",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return `⚠️ Gagal dispatch bot (Attendee ${res.status}): ${text.slice(0, 200)}`;
    }
    const data = (await res.json()) as { id: string };
    const sb = supabaseAdmin();
    const { error: insertErr } = await sb.from("meeting_bots").insert({
      user_id: userId,
      bot_id: data.id,
      meeting_url: meetingUrl,
      status: "joining",
    });
    if (insertErr) {
      return `Bot ter-dispatch (id: ${data.id}) tapi gagal simpan ke DB: ${insertErr.message}. Kamu masih bisa pantau bot-nya di dashboard Attendee.`;
    }
    return `✅ Bot Sigap Notetaker udah dikirim ke meeting. Setelah meeting selesai, kasih tau aku "kasih summary meeting" — aku fetch transcript + bikin summary + aksi (kalendar/task/email) kalau ada.`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return `⚠️ Gagal kirim bot: ${msg}`;
  }
}
