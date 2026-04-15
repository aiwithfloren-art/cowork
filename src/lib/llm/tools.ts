import { tool } from "ai";
import { z } from "zod";
import {
  getTodayEvents,
  getWeekEvents,
  addCalendarEvent,
  findEventByTitle,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google/calendar";
import {
  listTasks,
  addTask,
  completeTask,
  findTaskByTitle,
  updateTask,
  deleteTask,
} from "@/lib/google/tasks";
import { findCommonSlots } from "@/lib/google/freebusy";
import { readDoc } from "@/lib/google/docs";
import { webSearch } from "@/lib/web/search";
import { supabaseAdmin } from "@/lib/supabase/admin";

function shortType(mime: string): string {
  if (mime.includes("document")) return "Doc";
  if (mime.includes("spreadsheet")) return "Sheet";
  if (mime.includes("presentation")) return "Slides";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("folder")) return "Folder";
  if (mime.startsWith("image/")) return "Image";
  return "File";
}

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

    find_meeting_slots: tool({
      description:
        "Find open time slots for a meeting in the user's calendar during workday hours (09:00-18:00 Mon-Fri). Optionally include teammate emails to find SHARED free slots. Returns up to 5 slots.",
      inputSchema: z.object({
        duration_minutes: z
          .number()
          .describe("Duration of the meeting in minutes (e.g. 30, 60)"),
        days_ahead: z
          .number()
          .nullable()
          .optional()
          .describe("How many days to search ahead (default 7)"),
        with_emails: z
          .array(z.string())
          .nullable()
          .optional()
          .describe("Optional teammate emails to cross-reference"),
      }),
      execute: async ({ duration_minutes, days_ahead, with_emails }) => {
        const sb = supabaseAdmin();
        const userIds: string[] = [userId];
        const emails = with_emails ?? [];
        if (emails.length > 0) {
          const { data: others } = await sb
            .from("users")
            .select("id, email")
            .in(
              "email",
              emails.map((e) => e.toLowerCase()),
            );
          if (others) userIds.push(...others.map((u) => u.id));
        }
        const slots = await findCommonSlots(userIds, {
          durationMinutes: duration_minutes,
          daysAhead: days_ahead ?? 7,
          maxSlots: 5,
        });
        return {
          count: slots.length,
          slots: slots.map((s) => ({ start: s.start, end: s.end })),
        };
      },
    }),

    add_calendar_event: tool({
      description:
        "Create a new event on the user's Google Calendar. Use ISO datetime strings with timezone offset (e.g. '2026-04-15T08:00:00+07:00'). If the user doesn't specify an end time, default to 1 hour after start. Default timezone: Asia/Jakarta (+07:00).",
      inputSchema: z.object({
        title: z.string().describe("Event title / summary"),
        start: z
          .string()
          .describe("ISO datetime with timezone, e.g. 2026-04-15T08:00:00+07:00"),
        end: z.string().describe("ISO datetime with timezone"),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        attendees: z
          .array(z.string())
          .nullable()
          .optional()
          .describe("List of attendee emails (optional)"),
      }),
      execute: async (args) => {
        const res = await addCalendarEvent(userId, {
          title: args.title,
          start: args.start,
          end: args.end,
          description: args.description ?? undefined,
          location: args.location ?? undefined,
          attendees: args.attendees ?? undefined,
        });
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
        due: z
          .string()
          .nullable()
          .optional()
          .describe("ISO date string, or null"),
      }),
      execute: async ({ title, due }) => {
        const res = await addTask(userId, title, due ?? undefined);
        return { ok: true, id: res.id };
      },
    }),

    complete_task: tool({
      description:
        "Mark a Google Task as completed. Pass the task title (fuzzy-matched) as the 'query'.",
      inputSchema: z.object({
        query: z.string().describe("Task title or part of it"),
      }),
      execute: async ({ query }) => {
        const task = await findTaskByTitle(userId, query);
        if (!task)
          return { error: `No task matches "${query}"` };
        await completeTask(userId, task.id);
        return { ok: true, completed: task.title };
      },
    }),

    update_task: tool({
      description:
        "Update a Google Task's title, notes, or due date. Pass the task title (fuzzy-matched) as 'query'.",
      inputSchema: z.object({
        query: z.string().describe("Existing task title or part of it"),
        new_title: z.string().nullable().optional(),
        new_due: z
          .string()
          .nullable()
          .optional()
          .describe("ISO date string or null"),
        new_notes: z.string().nullable().optional(),
      }),
      execute: async ({ query, new_title, new_due, new_notes }) => {
        const task = await findTaskByTitle(userId, query);
        if (!task) return { error: `No task matches "${query}"` };
        await updateTask(userId, task.id, {
          title: new_title ?? undefined,
          due: new_due ?? undefined,
          notes: new_notes ?? undefined,
        });
        return { ok: true, updated: task.title };
      },
    }),

    delete_task: tool({
      description:
        "Permanently delete a Google Task (different from complete). Pass the task title as 'query'.",
      inputSchema: z.object({
        query: z.string().describe("Task title to delete"),
      }),
      execute: async ({ query }) => {
        const task = await findTaskByTitle(userId, query);
        if (!task) return { error: `No task matches "${query}"` };
        await deleteTask(userId, task.id);
        return { ok: true, deleted: task.title };
      },
    }),

    update_calendar_event: tool({
      description:
        "Update an existing calendar event (title, time, location, description). Pass the current event title (fuzzy match) as 'query'. Use ISO datetime with timezone for start/end.",
      inputSchema: z.object({
        query: z.string().describe("Current event title to find"),
        new_title: z.string().nullable().optional(),
        new_start: z
          .string()
          .nullable()
          .optional()
          .describe("ISO datetime, e.g. 2026-04-16T10:00:00+07:00"),
        new_end: z.string().nullable().optional(),
        new_location: z.string().nullable().optional(),
        new_description: z.string().nullable().optional(),
      }),
      execute: async ({
        query,
        new_title,
        new_start,
        new_end,
        new_location,
        new_description,
      }) => {
        const event = await findEventByTitle(userId, query);
        if (!event) return { error: `No event matches "${query}"` };
        await updateCalendarEvent(userId, event.id, {
          title: new_title ?? undefined,
          start: new_start ?? undefined,
          end: new_end ?? undefined,
          location: new_location ?? undefined,
          description: new_description ?? undefined,
        });
        return { ok: true, updated: event.title };
      },
    }),

    delete_calendar_event: tool({
      description:
        "Delete / cancel an event from Google Calendar. Pass the event title as 'query'.",
      inputSchema: z.object({
        query: z.string().describe("Event title to delete"),
      }),
      execute: async ({ query }) => {
        const event = await findEventByTitle(userId, query);
        if (!event) return { error: `No event matches "${query}"` };
        await deleteCalendarEvent(userId, event.id);
        return { ok: true, deleted: event.title };
      },
    }),

    list_connected_files: tool({
      description:
        "MUST call this for ANY user question about their files, documents, Google Drive, docs, sheets, spreadsheets, PDFs, or 'what files do I have'. Returns up to 30 most recent files (name + short type + id). After calling this, IMMEDIATELY give a text response listing the files to the user — do not call additional tools.",
      inputSchema: z.object({
        search: z
          .string()
          .nullable()
          .optional()
          .describe("Optional substring to filter file names by (case-insensitive)"),
      }),
      execute: async ({ search }) => {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type")
          .eq("user_id", userId)
          .order("added_at", { ascending: false });

        const all = data ?? [];
        const filtered = search
          ? all.filter((f) =>
              (f.file_name ?? "").toLowerCase().includes(search.toLowerCase()),
            )
          : all;
        const top = filtered.slice(0, 30);

        return {
          total: all.length,
          shown: top.length,
          files: top.map((f) => ({
            id: f.file_id,
            name: f.file_name,
            type: shortType(f.mime_type ?? ""),
          })),
        };
      },
    }),

    read_connected_file: tool({
      description:
        "READ the actual TEXT CONTENT of a connected Google Drive file. Use this whenever the user wants to summarize, read, explain, or see the content of a specific file. Pass the file name (or part of it) as 'query' — the tool fuzzy-matches. Do NOT call list_connected_files first; this tool already searches your connected files. Returns up to 8000 chars of text from the file body.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "File name, partial name, or file_id. Examples: 'Brand Style Guide', 'master content', or '1AbCdEf...'",
          ),
      }),
      execute: async ({ query }) => {
        const sb = supabaseAdmin();
        const trimmed = query.trim();

        // Fetch all user files once
        const { data: all } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type")
          .eq("user_id", userId);
        const files = all ?? [];

        // Try exact file_id match first
        let row = files.find((f) => f.file_id === trimmed) ?? null;

        // Then exact name (case-insensitive)
        if (!row) {
          const needle = trimmed.toLowerCase();
          row =
            files.find((f) => (f.file_name ?? "").toLowerCase() === needle) ?? null;
        }

        // Then substring match on name
        if (!row) {
          const needle = trimmed.toLowerCase();
          row =
            files.find((f) =>
              (f.file_name ?? "").toLowerCase().includes(needle),
            ) ?? null;
        }

        // Then word-by-word match (each word in query must appear in name)
        if (!row) {
          const words = trimmed
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 2);
          row =
            files.find((f) => {
              const name = (f.file_name ?? "").toLowerCase();
              return words.every((w) => name.includes(w));
            }) ?? null;
        }

        if (!row) {
          return {
            error: `No connected file matches "${trimmed}". Call list_connected_files first to see available files.`,
          };
        }

        try {
          const content = await readDoc(userId, row.file_id);
          return {
            file_name: row.file_name,
            content: content || "(empty document)",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Could not read file",
            file_name: row.file_name,
          };
        }
      },
    }),

    web_search: tool({
      description:
        "Search the public web for current information, news, articles, facts, or research. Use this when the user asks about anything you don't have built-in knowledge of, especially recent events, current data, or topics requiring fresh sources. Returns an AI-generated answer plus source links and snippets. Combine with read_connected_file when the user wants you to enrich findings with their own documents.",
      inputSchema: z.object({
        query: z.string().describe("Search query in natural language"),
      }),
      execute: async ({ query }) => {
        try {
          const result = await webSearch({ query, maxResults: 5 });
          return {
            answer: result.answer,
            sources: result.sources,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Web search failed",
          };
        }
      },
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
      inputSchema: z.object({
        limit: z.number().nullable().optional(),
      }),
      execute: async ({ limit }) => {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("notes")
          .select("content, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit ?? 20);
        return data ?? [];
      },
    }),
  };
}
