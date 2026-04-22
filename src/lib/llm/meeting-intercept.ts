import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateText, stepCountIs } from "ai";
import { getLLMForUser } from "./providers";
import { buildToolsForUser } from "./build-tools";
import { stripReasoningFromMessages } from "./strip-reasoning";

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

const SUMMARY_PATTERN =
  /\b(summary|summarize|rangkum|rangkuman|ringkas|ringkasan|hasil|recap)\b.*\b(meeting|rapat|call)\b|\b(meeting|rapat|call)\b.*\b(summary|summarize|rangkum|rangkuman|ringkas|ringkasan|hasil|recap)\b|\bkasih\s+summary\b|\bkelar\s+meeting\b|\bkasih\s+report\b.*(meeting|rapat)/i;

/**
 * Bypass for "kasih summary meeting" — Kimi K2 often claims the meeting
 * isn't done without actually calling get_meeting_summary. We fetch
 * Attendee directly, then hand the transcript to a second LLM call with
 * the full tool set so the model can actually write a summary AND take
 * action (create events, assign tasks, save notes).
 */
export async function tryInterceptMeetingSummary(
  userId: string,
  message: string,
): Promise<string | null> {
  if (!SUMMARY_PATTERN.test(message)) return null;

  const apiKey = process.env.ATTENDEE_API_KEY;
  if (!apiKey) return null;

  const sb = supabaseAdmin();
  const { data: latest } = await sb
    .from("meeting_bots")
    .select("bot_id, meeting_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.bot_id) {
    return "Belum ada bot yang ter-dispatch buat kamu. Pastikan kamu udah ketik 'rekam meeting ini <URL>' dulu.";
  }

  try {
    const statusRes = await fetch(
      `https://app.attendee.dev/api/v1/bots/${latest.bot_id}`,
      { headers: { Authorization: `Token ${apiKey}` } },
    );
    if (!statusRes.ok) {
      return `⚠️ Gagal cek status bot (Attendee ${statusRes.status}).`;
    }
    const bot = (await statusRes.json()) as {
      state?: string;
      transcription_state?: string;
    };
    if (bot.state !== "ended") {
      return `Meeting belum selesai (state: ${bot.state}). Akan otomatis berakhir kalau semua peserta leave, atau kamu klik End di Meet.`;
    }
    if (bot.transcription_state !== "complete") {
      return `Meeting udah selesai, tapi transcript masih diproses (state: ${bot.transcription_state}). Coba lagi ~30 detik.`;
    }

    const tRes = await fetch(
      `https://app.attendee.dev/api/v1/bots/${latest.bot_id}/transcript`,
      { headers: { Authorization: `Token ${apiKey}` } },
    );
    if (!tRes.ok) {
      return `⚠️ Gagal ambil transcript (Attendee ${tRes.status}).`;
    }
    const segments = (await tRes.json()) as Array<{
      speaker_name?: string;
      transcription?: { transcript?: string } | string | null;
    }>;
    const plain = segments
      .map((s) => {
        const text =
          typeof s.transcription === "string"
            ? s.transcription
            : s.transcription?.transcript ?? "";
        return `${s.speaker_name ?? "Speaker"}: ${text}`;
      })
      .filter((l) => l.trim().length > 0 && !l.endsWith(": "))
      .join("\n");

    if (!plain) {
      return "Meeting udah selesai tapi transcript kosong — mungkin nggak ada yang ngomong atau audio bot tidak capture.";
    }

    await sb
      .from("meeting_bots")
      .update({ status: "done", transcript: plain.slice(0, 50000) })
      .eq("bot_id", latest.bot_id);

    const llm = await getLLMForUser(userId);
    const tools = await buildToolsForUser(userId);
    const result = await generateText({
      model: llm.model,
      system: `You are Sigap. You just received a meeting transcript. Your job:
1) Write a concise summary in the user's language (2-4 bullet points: key decisions, topics, mood).
2) Extract action items and CALL tools for each:
   - Mentioned future meeting/event → add_calendar_event
   - Task delegated to a teammate (with their email) → assign_task_to_member
   - Task for the user themselves → add_task
   - Durable context worth remembering → save_note
3) End with a short confirmation of what tools you called.
Default timezone: Asia/Jakarta. Be brief.`,
      messages: [
        {
          role: "user",
          content: `Transcript from the meeting I just attended:\n\n${plain.slice(0, 8000)}`,
        },
      ],
      tools,
      stopWhen: stepCountIs(6),
      prepareStep: async ({ messages }) => ({
        messages: stripReasoningFromMessages(messages),
      }),
    });

    return result.text || "Transcript di-fetch, tapi model nggak balas apa-apa. Coba lagi.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return `⚠️ Gagal proses summary: ${msg}`;
  }
}
