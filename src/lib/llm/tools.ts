import { tool } from "ai";
import { z } from "zod";
import { getTodayEvents, getWeekEvents, addCalendarEvent } from "@/lib/google/calendar";
import { listTasks, addTask, completeTask } from "@/lib/google/tasks";
import { findCommonSlots } from "@/lib/google/freebusy";
import { readDoc } from "@/lib/google/docs";
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
        "Find open time slots for a meeting in the user's calendar during workday hours (09:00-18:00 Mon-Fri). Optionally include teammate emails from the same org to find SHARED free slots. Returns up to 5 slots. Use this when the user asks to schedule a meeting or find a time.",
      inputSchema: z.object({
        duration_minutes: z.number().describe("Duration of the meeting in minutes (e.g. 30, 60)"),
        days_ahead: z.number().optional().describe("How many days to search ahead (default 7)"),
        with_emails: z
          .array(z.string())
          .optional()
          .describe("Optional teammate emails to cross-reference calendars"),
      }),
      execute: async ({ duration_minutes, days_ahead, with_emails }) => {
        const sb = supabaseAdmin();
        const userIds: string[] = [userId];
        if (with_emails && with_emails.length > 0) {
          const { data: others } = await sb
            .from("users")
            .select("id, email")
            .in("email", with_emails.map((e) => e.toLowerCase()));
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
          note:
            slots.length === 0
              ? "No free slots found in workday hours."
              : "Present these times to the user in their local timezone (Asia/Jakarta +07:00).",
        };
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

    list_connected_files: tool({
      description:
        "MUST call this for ANY user question about their files, documents, Google Drive, docs, sheets, spreadsheets, PDFs, or 'what files do I have'. Returns up to 30 most recent files (name + short type + id). After calling this, IMMEDIATELY give a text response listing the files to the user — do not call additional tools.",
      inputSchema: z.object({
        search: z
          .string()
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
        "Read the content of a connected Google Drive file. Pass the file name (or part of it) OR the file_id from list_connected_files. The tool will fuzzy-match the file. Returns up to 8000 chars of text.",
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
