import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: string[];
  meetLink?: string;
};

export async function getEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const auth = await getGoogleClient(userId);
  const cal = google.calendar({ version: "v3", auth });

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items ?? []).map((e) => ({
    id: e.id!,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    attendees: e.attendees?.map((a) => a.email ?? "").filter(Boolean),
    meetLink: e.hangoutLink ?? undefined,
  }));
}

export async function getTodayEvents(userId: string) {
  // Compute "today" in Asia/Jakarta so the server (UTC) doesn't cut off events.
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now.getTime() + wibOffset);
  const yyyy = wibNow.getUTCFullYear();
  const mm = wibNow.getUTCMonth();
  const dd = wibNow.getUTCDate();
  // Start of day WIB = 00:00 WIB = previous day 17:00 UTC
  const start = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0) - wibOffset);
  const end = new Date(Date.UTC(yyyy, mm, dd, 23, 59, 59) - wibOffset);
  return getEvents(userId, start, end);
}

export async function getWeekEvents(userId: string) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return getEvents(userId, now, end);
}

export async function addCalendarEvent(
  userId: string,
  args: {
    title: string;
    start: string; // ISO datetime
    end: string; // ISO datetime
    description?: string;
    location?: string;
    attendees?: string[];
  },
): Promise<{ id: string; htmlLink: string }> {
  const auth = await getGoogleClient(userId);
  const cal = google.calendar({ version: "v3", auth });

  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.title,
      description: args.description,
      location: args.location,
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: args.attendees?.map((email) => ({ email })),
    },
  });

  return {
    id: res.data.id ?? "",
    htmlLink: res.data.htmlLink ?? "",
  };
}
