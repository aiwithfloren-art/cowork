import { tool } from "ai";
import { z } from "zod";
import { getTodayEvents, getWeekEvents, addCalendarEvent } from "@/lib/google/calendar";
import { listTasks, addTask, completeTask } from "@/lib/google/tasks";
import { searchDocs, readDoc } from "@/lib/google/docs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function buildTools(userId: string) {
  return {
    get_today_schedule: tool({
      description: "Get the user's Google Calendar events for today.",
      inputSchema: z.object({}),
      execute: async () => {
        const events = await getTodayEvents(userId);
        return events.map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
          location: e.location,
          attendees: e.attendees?.length,
        }));
      },
    }),

    get_week_schedule: tool({
      description: "Get the user's Google Calendar events for the next 7 days.",
      inputSchema: z.object({}),
      execute: async () => {
        const events = await getWeekEvents(userId);
        return events.map((e) => ({ title: e.title, start: e.start, end: e.end }));
      },
    }),

    add_calendar_event: tool({
      description:
        "Create a new event on the user's Google Calendar. Use ISO datetime strings with timezone offset (e.g. '2026-04-15T08:00:00+07:00'). If the user doesn't specify an end time, default to 1 hour after start. The user's timezone is Asia/Jakarta (+07:00) unless stated otherwise.",
      inputSchema: z.object({
        title: z.string().describe("Event title / summary"),
        start: z.string().describe("ISO datetime with timezone, e.g. 2026-04-15T08:00:00+07:00"),
        end: z.string().describe("ISO datetime with timezone"),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional().describe("List of attendee emails"),
      }),
      execute: async (args) => {
        const res = await addCalendarEvent(userId, args);
        return { ok: true, event_id: res.id, link: res.htmlLink };
      },
    }),

    list_tasks: tool({
      description: "List the user's open Google Tasks.",
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = await listTasks(userId);
        return tasks.map((t) => ({ id: t.id, title: t.title, due: t.due }));
      },
    }),

    add_task: tool({
      description: "Add a new Google Task.",
      inputSchema: z.object({
        title: z.string(),
        due: z.string().optional().describe("ISO date string"),
      }),
      execute: async ({ title, due }) => {
        const res = await addTask(userId, title, due);
        return { ok: true, id: res.id };
      },
    }),

    complete_task: tool({
      description: "Mark a Google Task as completed.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        await completeTask(userId, id);
        return { ok: true };
      },
    }),

    search_docs: tool({
      description: "Search the user's Google Drive for Docs by name.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => searchDocs(userId, query),
    }),

    read_doc: tool({
      description: "Read the content of a Google Doc by its ID.",
      inputSchema: z.object({ doc_id: z.string() }),
      execute: async ({ doc_id }) => ({ content: await readDoc(userId, doc_id) }),
    }),

    save_note: tool({
      description: "Save a private note for the user.",
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) => {
        const sb = supabaseAdmin();
        await sb.from("notes").insert({ user_id: userId, content });
        return { ok: true };
      },
    }),

    get_notes: tool({
      description: "Retrieve the user's recent private notes.",
      inputSchema: z.object({ limit: z.number().optional() }),
      execute: async ({ limit = 20 }) => {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("notes")
          .select("content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return data ?? [];
      },
    }),
  };
}
