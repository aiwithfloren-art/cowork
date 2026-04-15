import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type EmailSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
};

export async function listRecentEmails(
  userId: string,
  args: { query?: string; maxResults?: number } = {},
): Promise<EmailSummary[]> {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const q = args.query || "in:inbox";
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: args.maxResults ?? 10,
  });

  const ids = (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
  if (ids.length === 0) return [];

  const details = await Promise.all(
    ids.map((id) =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      }),
    ),
  );

  return details.map((d) => {
    const headers = d.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? "";
    return {
      id: d.data.id!,
      threadId: d.data.threadId ?? "",
      from: getHeader("From"),
      subject: getHeader("Subject") || "(no subject)",
      snippet: d.data.snippet ?? "",
      date: getHeader("Date"),
      unread: d.data.labelIds?.includes("UNREAD") ?? false,
    };
  });
}

export async function readEmail(
  userId: string,
  messageId: string,
): Promise<{ from: string; subject: string; body: string; date: string }> {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    "";

  const body = extractBody(res.data.payload);

  return {
    from: getHeader("From"),
    subject: getHeader("Subject") || "(no subject)",
    date: getHeader("Date"),
    body: body.slice(0, 8000),
  };
}

export async function sendEmail(
  userId: string,
  args: { to: string; subject: string; body: string; cc?: string; bcc?: string },
): Promise<{ id: string; threadId: string }> {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const headers = [
    `To: ${args.to}`,
    args.cc ? `Cc: ${args.cc}` : "",
    args.bcc ? `Bcc: ${args.bcc}` : "",
    `Subject: ${args.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ]
    .filter(Boolean)
    .join("\r\n");

  const rfc822 = `${headers}\r\n\r\n${args.body}`;
  const raw = Buffer.from(rfc822)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    id: res.data.id ?? "",
    threadId: res.data.threadId ?? "",
  };
}

type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
};

function extractBody(payload: GmailPart | null | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = Buffer.from(payload.body.data, "base64").toString("utf-8");
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return "";
}
