import { supabaseAdmin } from "@/lib/supabase/admin";
import { listRecentEmails, readEmail } from "@/lib/google/gmail";
import { readRows, updateCell } from "@/lib/google/sheets";
import { sendTelegramMessage } from "@/lib/telegram/client";

type SheetMatch = {
  sheetId: string;
  rowNumber: number;
  prospectName: string;
  prospectEmail: string;
  emailMsgId: string;
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  emailBody: string;
};

const COL_RESPONSE_STATUS = "L"; // 12
const COL_REPLY_DATE = "M"; // 13
const COL_REPLY_CONTENT = "N"; // 14
const COL_LAST_CONTACT = "O"; // 15
const COL_NEXT_ACTION = "P"; // 16

function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export async function checkRepliesForUser(
  userId: string,
): Promise<{ checked_sheets: number; matches: number; updated_rows: number; notifs_sent: number }> {
  const sb = supabaseAdmin();
  const { data: sheets } = await sb
    .from("lead_gen_sheets")
    .select("spreadsheet_id, last_checked_at, title")
    .eq("user_id", userId);

  if (!sheets?.length) return { checked_sheets: 0, matches: 0, updated_rows: 0, notifs_sent: 0 };

  const sinceTs = sheets.reduce<string | null>((min, s) => {
    if (!s.last_checked_at) return null;
    if (!min) return s.last_checked_at as string;
    return (s.last_checked_at as string) < min ? (s.last_checked_at as string) : min;
  }, null);

  const sinceDate = sinceTs ? new Date(sinceTs) : new Date(Date.now() - 24 * 3600 * 1000);
  const gmailQ = `in:inbox after:${Math.floor(sinceDate.getTime() / 1000)}`;
  const recentEmails = await listRecentEmails(userId, { query: gmailQ, maxResults: 50 }).catch(() => []);

  if (recentEmails.length === 0) {
    for (const s of sheets) {
      await sb.from("lead_gen_sheets").update({ last_checked_at: new Date().toISOString() })
        .eq("user_id", userId).eq("spreadsheet_id", s.spreadsheet_id as string);
    }
    return { checked_sheets: sheets.length, matches: 0, updated_rows: 0, notifs_sent: 0 };
  }

  const senderMap = new Map<string, typeof recentEmails[number]>();
  for (const e of recentEmails) {
    const addr = extractEmailAddress(e.from);
    if (!senderMap.has(addr)) senderMap.set(addr, e);
  }

  const matches: SheetMatch[] = [];
  for (const s of sheets) {
    const sheetId = s.spreadsheet_id as string;
    const rows = await readRows(userId, sheetId).catch(() => ({ rows: [] }));
    const header = rows.rows[0] || [];
    const emailColIdx = header.findIndex((h) => h.toLowerCase() === "email");
    const nameColIdx = header.findIndex((h) => h.toLowerCase() === "business name");
    const responseStatusIdx = header.findIndex((h) => h.toLowerCase() === "response status");
    if (emailColIdx < 0 || responseStatusIdx < 0) continue;

    for (let i = 1; i < rows.rows.length; i++) {
      const row = rows.rows[i];
      const prospectEmail = (row[emailColIdx] || "").trim().toLowerCase();
      if (!prospectEmail || prospectEmail === "not_found") continue;
      if ((row[responseStatusIdx] || "").toUpperCase() === "REPLIED") continue;

      const match = senderMap.get(prospectEmail);
      if (!match) continue;

      const fullEmail = await readEmail(userId, match.id).catch(() => null);
      matches.push({
        sheetId,
        rowNumber: i + 1,
        prospectName: row[nameColIdx] || prospectEmail,
        prospectEmail,
        emailMsgId: match.id,
        emailFrom: match.from,
        emailSubject: match.subject,
        emailDate: match.date,
        emailBody: fullEmail?.body?.slice(0, 500) ?? match.snippet,
      });
    }
  }

  let updatedRows = 0;
  for (const m of matches) {
    try {
      await updateCell(userId, m.sheetId, m.rowNumber, COL_RESPONSE_STATUS, "REPLIED");
      await updateCell(userId, m.sheetId, m.rowNumber, COL_REPLY_DATE, m.emailDate);
      await updateCell(userId, m.sheetId, m.rowNumber, COL_REPLY_CONTENT, m.emailBody);
      await updateCell(userId, m.sheetId, m.rowNumber, COL_LAST_CONTACT, new Date().toISOString());
      await updateCell(userId, m.sheetId, m.rowNumber, COL_NEXT_ACTION, "Review reply, draft follow-up");
      updatedRows++;
    } catch (e) {
      console.error("[reply-tracker] update fail", m.prospectName, e);
    }
  }

  let notifsSent = 0;
  if (matches.length > 0) {
    const { data: tg } = await sb
      .from("telegram_links")
      .select("telegram_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    const tgChatId = tg?.telegram_user_id as number | null | undefined;
    if (tgChatId) {
      const lines = matches.map(
        (m) => `• *${m.prospectName}* — ${m.emailSubject}\n  _${m.emailBody.slice(0, 120)}_`,
      );
      const text = `📬 *${matches.length} prospect baru bales!*\n\n${lines.join("\n\n")}\n\nSheet udah ke-update.`;
      const ok = await sendTelegramMessage(tgChatId, text);
      if (ok) notifsSent++;
    }
  }

  for (const s of sheets) {
    await sb.from("lead_gen_sheets").update({ last_checked_at: new Date().toISOString() })
      .eq("user_id", userId).eq("spreadsheet_id", s.spreadsheet_id as string);
  }

  return {
    checked_sheets: sheets.length,
    matches: matches.length,
    updated_rows: updatedRows,
    notifs_sent: notifsSent,
  };
}
