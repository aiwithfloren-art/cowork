import { tool } from "ai";
import { z } from "zod";
import crypto from "crypto";
import { sendHtmlEmail } from "@/lib/google/gmail";
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
import { shareFile, type DriveRole } from "@/lib/google/drive";
import { listRecentEmails, readEmail, sendEmail } from "@/lib/google/gmail";
import { webSearch } from "@/lib/web/search";
import { supabaseAdmin } from "@/lib/supabase/admin";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
      description:
        "List the user's Google Tasks. By default returns only OPEN tasks. Set include_completed=true when the user asks to see what they've finished, progress review, done tasks, 'task yang udah selesai', 'apa aja yang udah gue kerjain'.",
      inputSchema: z.object({
        include_completed: z
          .boolean()
          .nullable()
          .optional()
          .describe("Default false. Set true to include completed tasks."),
      }),
      execute: async ({ include_completed }) => {
        const tasks = await listTasks(userId, {
          showCompleted: include_completed ?? false,
        });
        return tasks.map((t) => ({
          id: t.id,
          title: t.title,
          due: t.due,
          status: t.status,
        }));
      },
    }),

    // NOTE: add_task creates in the CURRENT user's Google Tasks only.
    // To give a task to a teammate, use assign_task_to_member instead.
    add_task: tool({
      description:
        "Add a new Google Task TO THE CURRENT USER'S OWN task list. DO NOT use this when the task is for a teammate — use assign_task_to_member instead (it creates the task in the teammate's Google Tasks and sends them a notification).",
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
        "READ the actual TEXT CONTENT of connected Google Drive files. Fuzzy-matches by name. By default returns the single best match. Set read_all=true when the user asks about a topic that may span multiple files (e.g. 'summary semua doc Acme', 'ringkas semua notes tentang X') — the tool will return up to 5 matching files so you can synthesize across them. Do NOT call list_connected_files first. Each file returns up to 8000 chars.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "File name, partial name, topic, or file_id. Examples: 'Brand Style Guide', 'Acme', 'master content'",
          ),
        read_all: z
          .boolean()
          .nullable()
          .optional()
          .describe(
            "Default false (single best match). Set true to return all files whose names match the query (up to 5).",
          ),
      }),
      execute: async ({ query, read_all }) => {
        const sb = supabaseAdmin();
        const trimmed = query.trim();

        const { data: all } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type")
          .eq("user_id", userId);
        const files = all ?? [];

        const needle = trimmed.toLowerCase();
        const words = needle
          .split(/\s+/)
          .filter((w) => w.length > 2);

        const score = (f: { file_id: string; file_name: string | null }) => {
          const name = (f.file_name ?? "").toLowerCase();
          if (f.file_id === trimmed) return 100;
          if (name === needle) return 90;
          if (name.includes(needle)) return 80;
          if (words.length && words.every((w) => name.includes(w))) return 60;
          return 0;
        };

        const ranked = files
          .map((f) => ({ file: f, score: score(f) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
          return {
            error: `No connected file matches "${trimmed}". Call list_connected_files first to see available files.`,
          };
        }

        const limit = read_all ? 5 : 1;
        const targets = ranked.slice(0, limit);

        const results = await Promise.all(
          targets.map(async ({ file }) => {
            try {
              const content = await readDoc(userId, file.file_id);
              return {
                file_name: file.file_name,
                content: (content || "(empty document)").slice(0, 8000),
              };
            } catch (e) {
              return {
                file_name: file.file_name,
                error: e instanceof Error ? e.message : "Could not read file",
              };
            }
          }),
        );

        if (!read_all) {
          return results[0];
        }
        return { count: results.length, files: results };
      },
    }),

    share_drive_file: tool({
      description:
        "Share a connected Google Drive file or folder with someone by email, granting them access (view / comment / edit). Use when the user says things like 'kasih akses', 'share folder X ke budi', 'bagi akses gdrive', 'beri izin edit', etc. The file MUST already be in the user's connected files (run list_connected_files first if unsure). Only picks files the user explicitly connected via Cowork — cannot share arbitrary Drive files. Google sends a notification email to the recipient automatically.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Name, partial name, or file_id of the connected file/folder to share. Example: 'Proposal Q1', 'Brand Guide'",
          ),
        email: z.string().describe("Recipient email address"),
        role: z
          .enum(["reader", "commenter", "writer"])
          .describe(
            "Access level. 'reader' = view only, 'commenter' = view + comment, 'writer' = full edit. Default to 'reader' if the user did not specify.",
          ),
        message: z
          .string()
          .nullable()
          .optional()
          .describe("Optional personal message included in Google's notification email"),
      }),
      execute: async ({ query, email, role, message }) => {
        const sb = supabaseAdmin();
        const trimmed = query.trim();

        const { data: all } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type")
          .eq("user_id", userId);
        const files = all ?? [];

        const needle = trimmed.toLowerCase();
        const words = needle.split(/\s+/).filter((w) => w.length > 2);

        const score = (f: { file_id: string; file_name: string | null }) => {
          const name = (f.file_name ?? "").toLowerCase();
          if (f.file_id === trimmed) return 100;
          if (name === needle) return 90;
          if (name.includes(needle)) return 80;
          if (words.length && words.every((w) => name.includes(w))) return 60;
          return 0;
        };

        const ranked = files
          .map((f) => ({ file: f, score: score(f) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
          return {
            error: `No connected file matches "${trimmed}". The user must first connect the file/folder to Cowork via Settings → Connect Google Drive file (picker), then retry. Only connected files can be shared.`,
          };
        }

        const target = ranked[0].file;

        try {
          const res = await shareFile(
            userId,
            target.file_id,
            email,
            role as DriveRole,
            message ?? undefined,
          );
          return {
            ok: true,
            file_name: target.file_name,
            file_id: target.file_id,
            shared_with: email,
            role,
            permission_id: res.permissionId,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Share failed";
          if (/insufficient.*scope|invalid_scope|PERMISSION_DENIED/i.test(msg)) {
            return {
              error:
                "Google Drive share access not granted. Tell the user: buka /settings lalu klik 'Reconnect Google' untuk memberikan izin share file.",
            };
          }
          if (/notFound|not found/i.test(msg)) {
            return {
              error: `File "${target.file_name}" tidak ditemukan di Google Drive user. Mungkin udah dihapus atau user ga punya akses lagi.`,
            };
          }
          return { error: msg };
        }
      },
    }),

    list_recent_emails: tool({
      description:
        "List the user's recent Gmail emails (from inbox by default). Returns subject, sender, date, and snippet. Use this when the user asks 'check my email', 'what emails do I have', 'summarize my inbox', etc.",
      inputSchema: z.object({
        query: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Optional Gmail search query, e.g. 'from:budi', 'is:unread', 'subject:invoice'. Defaults to 'in:inbox'.",
          ),
        max_results: z.number().nullable().optional(),
      }),
      execute: async ({ query, max_results }) => {
        try {
          const emails = await listRecentEmails(userId, {
            query: query ?? undefined,
            maxResults: max_results ?? 10,
          });
          return {
            count: emails.length,
            emails: emails.map((e) => ({
              id: e.id,
              from: e.from,
              subject: e.subject,
              date: e.date,
              snippet: e.snippet,
              unread: e.unread,
            })),
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Gmail fetch failed";
          if (/insufficient.*scope|invalid_scope|PERMISSION_DENIED/i.test(msg)) {
            return {
              error:
                "Gmail access not granted. The user needs to reconnect their Google account in Settings to grant the gmail.readonly scope. Tell them exactly this: buka /settings lalu klik 'Reconnect Google'.",
            };
          }
          return { error: msg };
        }
      },
    }),

    read_email: tool({
      description:
        "Read the full body of a specific Gmail email by its ID. Use after list_recent_emails to drill into a specific message. Returns from, subject, date, and body (up to 8000 chars).",
      inputSchema: z.object({
        message_id: z.string().describe("Gmail message ID from list_recent_emails"),
      }),
      execute: async ({ message_id }) => {
        try {
          const email = await readEmail(userId, message_id);
          return email;
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Read failed" };
        }
      },
    }),

    send_email: tool({
      description:
        "Send a Gmail email on behalf of the user. Use when the user says 'kirim email', 'send this', 'kirimkan', etc. Always confirm the recipient, subject, and body in your reply after sending. Do NOT send unless the user has explicitly approved the draft content.",
      inputSchema: z.object({
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Plain-text email body"),
        cc: z.string().nullable().optional(),
        bcc: z.string().nullable().optional(),
      }),
      execute: async ({ to, subject, body, cc, bcc }) => {
        try {
          const res = await sendEmail(userId, {
            to,
            subject,
            body,
            cc: cc ?? undefined,
            bcc: bcc ?? undefined,
          });
          return { ok: true, id: res.id, to, subject };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Send failed";
          if (/insufficient.*scope|invalid_scope|PERMISSION_DENIED/i.test(msg)) {
            return {
              error:
                "Gmail send access not granted. Tell the user: buka /settings lalu klik 'Reconnect Google' untuk memberikan izin kirim email.",
            };
          }
          return { error: msg };
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

    start_meeting_bot: tool({
      description:
        "Send an AI bot to join a Zoom/Meet/Teams meeting to record and transcribe it. Use when the user says 'rekam meeting', 'join meeting X untuk record', 'suruh bot masuk ke meeting'. Returns a bot_id — user later says 'kelar meeting gue, kasih summary' and you call get_meeting_summary with that bot_id.",
      inputSchema: z.object({
        meeting_url: z
          .string()
          .describe("Full URL of the Zoom/Meet/Teams meeting"),
        bot_name: z
          .string()
          .nullable()
          .optional()
          .describe("Display name for the bot in the meeting. Default 'Sigap Notetaker'."),
      }),
      execute: async ({ meeting_url, bot_name }) => {
        const apiKey = process.env.RECALL_API_KEY;
        if (!apiKey) {
          return {
            error:
              "Meeting bot not configured. Admin must set RECALL_API_KEY and RECALL_REGION in environment.",
          };
        }
        const region = process.env.RECALL_REGION || "us-west-2";
        try {
          const res = await fetch(`https://${region}.recall.ai/api/v1/bot`, {
            method: "POST",
            headers: {
              Authorization: `Token ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              meeting_url,
              bot_name: bot_name || "Sigap Notetaker",
              recording_config: {
                transcript: { provider: { meeting_captions: {} } },
              },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            return { error: `Recall API ${res.status}: ${text.slice(0, 200)}` };
          }
          const data = (await res.json()) as { id: string };
          const sb = supabaseAdmin();
          await sb.from("meeting_bots").insert({
            user_id: userId,
            bot_id: data.id,
            meeting_url,
            status: "joining",
          });
          return {
            ok: true,
            bot_id: data.id,
            note: "Bot dispatched. Say 'kasih summary meeting' after it ends.",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to dispatch bot",
          };
        }
      },
    }),

    get_meeting_summary: tool({
      description:
        "Retrieve transcript and generate a summary for a meeting that a bot recorded earlier. Use when the user says 'kasih summary meeting', 'apa hasil meeting tadi', 'udah kelar, kasih report'. If bot_id is omitted, picks the user's most recent bot.",
      inputSchema: z.object({
        bot_id: z
          .string()
          .nullable()
          .optional()
          .describe("Bot ID from start_meeting_bot. Omit to use the most recent."),
      }),
      execute: async ({ bot_id }) => {
        const apiKey = process.env.RECALL_API_KEY;
        if (!apiKey) {
          return { error: "RECALL_API_KEY not set" };
        }
        const region = process.env.RECALL_REGION || "us-west-2";
        const sb = supabaseAdmin();
        let id = bot_id;
        if (!id) {
          const { data } = await sb
            .from("meeting_bots")
            .select("bot_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          id = data?.bot_id;
          if (!id) return { error: "No meeting bot found. Dispatch one first." };
        }
        try {
          const res = await fetch(`https://${region}.recall.ai/api/v1/bot/${id}`, {
            headers: { Authorization: `Token ${apiKey}` },
          });
          if (!res.ok) {
            return { error: `Recall API ${res.status}` };
          }
          const bot = (await res.json()) as {
            status_changes?: Array<{ code: string }>;
            recordings?: Array<{
              media_shortcuts?: {
                transcript?: {
                  data?: { download_url?: string };
                };
              };
            }>;
          };
          const latestStatus =
            bot.status_changes?.[bot.status_changes.length - 1]?.code;
          if (latestStatus !== "done") {
            return {
              status: latestStatus || "unknown",
              note: "Meeting not finished yet. Try again after it ends.",
            };
          }
          const transcriptUrl =
            bot.recordings?.[0]?.media_shortcuts?.transcript?.data?.download_url;
          if (!transcriptUrl) {
            return { status: "done", error: "No transcript URL yet (still processing)." };
          }
          const tRes = await fetch(transcriptUrl);
          const transcript = (await tRes.json()) as Array<{
            participant?: { name?: string };
            words?: Array<{ text: string }>;
          }>;
          const plain = transcript
            .map(
              (seg) =>
                `${seg.participant?.name ?? "Speaker"}: ${(seg.words ?? []).map((w) => w.text).join(" ")}`,
            )
            .join("\n");
          await sb
            .from("meeting_bots")
            .update({ status: "done", transcript: plain.slice(0, 50000) })
            .eq("bot_id", id);
          return {
            ok: true,
            transcript_excerpt: plain.slice(0, 4000),
            note:
              "Full transcript stored. You (the AI) should now write a concise summary from the excerpt: key decisions, action items, next steps. Offer to save it as a team note.",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to fetch bot status",
          };
        }
      },
    }),

    generate_image: tool({
      description:
        "Generate an image from a text prompt using Google Gemini Flash Image via OpenRouter. Use when the user asks to 'bikin gambar', 'create image', 'generate image', 'buatin ilustrasi', etc. Returns a public URL — for Slack, post the URL on its own line (no markdown wrapper) so Slack auto-unfurls it into a preview. For web chat, use markdown ![](url).",
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            "Detailed description of the image. Include style, mood, composition. English gives best results but Indonesian works.",
          ),
      }),
      execute: async ({ prompt }) => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return {
            error:
              "Image generation not configured. Admin must set OPENROUTER_API_KEY in environment.",
          };
        }
        try {
          const res = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [{ role: "user", content: prompt }],
                modalities: ["image", "text"],
              }),
            },
          );
          if (!res.ok) {
            const text = await res.text();
            return {
              error: `OpenRouter ${res.status}: ${text.slice(0, 300)}`,
            };
          }
          const data = (await res.json()) as {
            choices?: Array<{
              message?: {
                content?: string;
                images?: Array<{ image_url?: { url?: string } }>;
              };
            }>;
          };
          const dataUri =
            data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (!dataUri || !dataUri.startsWith("data:image/")) {
            return { error: "No image returned from model" };
          }
          const match = dataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/);
          if (!match) return { error: "Unexpected image data URI format" };
          const mime = match[1];
          const base64 = match[2];
          const buffer = Buffer.from(base64, "base64");
          const ext = mime.split("/")[1] || "png";
          const filename = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

          const sb = supabaseAdmin();
          const BUCKET = "sigap-images";
          const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(filename, buffer, {
              contentType: mime,
              cacheControl: "31536000",
            });
          if (uploadErr) {
            if (/Bucket not found/i.test(uploadErr.message)) {
              const { error: createErr } = await sb.storage.createBucket(
                BUCKET,
                { public: true },
              );
              if (createErr) {
                return { error: `Bucket create failed: ${createErr.message}` };
              }
              const retry = await sb.storage
                .from(BUCKET)
                .upload(filename, buffer, {
                  contentType: mime,
                  cacheControl: "31536000",
                });
              if (retry.error) {
                return { error: `Upload failed: ${retry.error.message}` };
              }
            } else {
              return { error: `Upload failed: ${uploadErr.message}` };
            }
          }
          const { data: publicData } = sb.storage
            .from(BUCKET)
            .getPublicUrl(filename);
          const publicUrl = publicData.publicUrl;
          const caption = data.choices?.[0]?.message?.content ?? "";
          return {
            url: publicUrl,
            caption,
            note: "Image stored permanently. Embed the URL directly so Slack auto-unfurls it.",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Image generation failed",
          };
        }
      },
    }),

    save_note: tool({
      description:
        "Save a typed memory. Types: 'user' (who the user is), 'feedback' (how to work with them), 'project' (current work/deals/metrics/people), 'reference' (external pointers), 'general' (fallback). Visibility: 'private' (default, only the user), 'team' (whole organization can read — use for shared knowledge like pricing, OKRs, client info that the whole team needs). Only use 'team' when the user is in an org AND the info is clearly team-relevant.",
      inputSchema: z.object({
        content: z.string(),
        type: z.enum(["general", "user", "feedback", "project", "reference"]),
        visibility: z
          .enum(["private", "team"])
          .nullable()
          .optional()
          .describe("Default 'private'. Use 'team' for shared team knowledge."),
      }),
      execute: async ({ content, type, visibility }) => {
        const sb = supabaseAdmin();
        const vis = visibility ?? "private";
        let orgId: string | null = null;
        if (vis === "team") {
          const { data: m } = await sb
            .from("org_members")
            .select("org_id")
            .eq("user_id", userId)
            .maybeSingle();
          orgId = m?.org_id ?? null;
          if (!orgId) {
            return {
              error:
                "Cannot save as team note: user is not in any organization. Ask them to create/join one at /team first, or save as private.",
            };
          }
        }
        await sb.from("notes").insert({
          user_id: userId,
          content,
          type: type ?? "general",
          visibility: vis,
          org_id: orgId,
        });
        return { ok: true, type, visibility: vis };
      },
    }),

    assign_task_to_member: tool({
      description:
        "Assign a task to a team member. Creates the task in THEIR Google Tasks (uses their OAuth token), AND creates an in-app notification so they see 'Florentini assigned you: ...' when they open Sigap, AND sends them an email via the current user's Gmail. Use for 'kasih task ke Budi X', 'assign proposal review ke Sarah deadline Jumat'. Call list_team_members first if you need to look up the member's email/userId.",
      inputSchema: z.object({
        member_email: z
          .string()
          .describe("The email address of the team member to assign to"),
        title: z.string().describe("Short task title"),
        due: z
          .string()
          .nullable()
          .optional()
          .describe("ISO date (YYYY-MM-DD) for deadline, optional"),
        notes: z
          .string()
          .nullable()
          .optional()
          .describe("Extra context to attach to the task"),
      }),
      execute: async ({ member_email, title, due, notes }) => {
        console.log("[assign_task_to_member] called", { member_email, title, due, by: userId });
        const sb = supabaseAdmin();
        const { data: target } = await sb
          .from("users")
          .select("id, name, email")
          .eq("email", member_email)
          .maybeSingle();
        if (!target) {
          console.log("[assign_task_to_member] target not found", member_email);
          return { error: `No user found with email ${member_email}` };
        }

        const { data: myMembership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .maybeSingle();
        const { data: theirMembership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", target.id)
          .maybeSingle();
        if (
          !myMembership?.org_id ||
          myMembership.org_id !== theirMembership?.org_id
        ) {
          return {
            error: `${target.email} is not in your organization. You can only assign tasks to teammates in the same org.`,
          };
        }

        const { data: actor } = await sb
          .from("users")
          .select("name, email")
          .eq("id", userId)
          .maybeSingle();
        const actorName = actor?.name || actor?.email || "A teammate";

        const taskBody = notes
          ? `Assigned by ${actorName} via Sigap.\n\n${notes}`
          : `Assigned by ${actorName} via Sigap.`;

        let taskCreated = false;
        try {
          await addTask(target.id, title, due ?? undefined);
          taskCreated = true;
        } catch (e) {
          return {
            error: `Could not create task in ${target.email}'s Google Tasks: ${e instanceof Error ? e.message : "unknown"}. They may need to reconnect Google.`,
          };
        }

        await sb.from("notifications").insert({
          user_id: target.id,
          actor_id: userId,
          kind: "task_assigned",
          title: `${actorName} assigned you a task`,
          body: `${title}${due ? ` — deadline ${due}` : ""}${notes ? `\n\n${notes}` : ""}`,
          link: "/dashboard",
        });

        let emailSent = false;
        try {
          await sendEmail(userId, {
            to: target.email!,
            subject: `New task from ${actorName}: ${title}`,
            body: `Hi ${target.name || "there"},\n\n${actorName} assigned you a task via Sigap:\n\n${title}${due ? `\nDeadline: ${due}` : ""}${notes ? `\n\nNotes:\n${notes}` : ""}\n\nIt's already in your Google Tasks. Open Sigap to see it on your dashboard.\n\n— Sigap`,
          });
          emailSent = true;
        } catch {
          // email is best-effort; task + notification already succeeded
        }

        return {
          ok: true,
          assigned_to: target.email,
          task_created: taskCreated,
          notification_created: true,
          email_sent: emailSent,
        };
      },
    }),

    broadcast_to_team: tool({
      description:
        "Announce something to the whole team in one shot. Inserts a notification for every member in the user's organization. Optionally also (1) creates a shared calendar event on every member's Google Calendar, (2) adds a prep task to every member's Google Tasks, (3) sends an email to every member. Use for 'kabarin tim demo Jumat wajib attend', 'broadcast: launch delay ke Senin depan', 'umumin ke semua: meeting retro besok jam 15'. Excludes the sender from the recipient list (they already know).",
      inputSchema: z.object({
        title: z.string().describe("Short headline the team will see"),
        body: z.string().describe("Full announcement text"),
        create_event: z
          .boolean()
          .nullable()
          .optional()
          .describe("Create the same event on every member's calendar."),
        event_start: z
          .string()
          .nullable()
          .optional()
          .describe("ISO datetime with +07:00 offset, required if create_event=true"),
        event_end: z.string().nullable().optional(),
        event_location: z.string().nullable().optional(),
        create_task: z
          .boolean()
          .nullable()
          .optional()
          .describe("Add a prep task to every member's Google Tasks."),
        task_title: z.string().nullable().optional(),
        task_due: z.string().nullable().optional(),
        send_email: z
          .boolean()
          .nullable()
          .optional()
          .describe("Also send an email to every member via the caller's Gmail."),
      }),
      execute: async (args) => {
        const sb = supabaseAdmin();
        const { data: myMembership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .maybeSingle();
        const orgId = myMembership?.org_id;
        if (!orgId) {
          return {
            error:
              "You are not in any organization. Broadcast only works within a team — create or join one at /team first.",
          };
        }

        const { data: members } = await sb
          .from("org_members")
          .select("user_id, users:user_id(name, email)")
          .eq("org_id", orgId);
        const targets = (members ?? [])
          .map((m) => {
            const u = m.users as { name?: string; email?: string } | null;
            return { user_id: m.user_id, email: u?.email, name: u?.name };
          })
          .filter((m) => m.user_id !== userId);

        if (targets.length === 0) {
          return {
            error:
              "You are the only person in this org. Invite teammates at /team before broadcasting.",
          };
        }

        const { data: actor } = await sb
          .from("users")
          .select("name, email")
          .eq("id", userId)
          .maybeSingle();
        const actorName = actor?.name || actor?.email || "A teammate";

        const notifRows = targets.map((t) => ({
          user_id: t.user_id,
          actor_id: userId,
          kind: "broadcast",
          title: `${actorName}: ${args.title}`,
          body: args.body,
          link: "/dashboard",
        }));
        await sb.from("notifications").insert(notifRows);

        const events: { email?: string; ok: boolean; err?: string }[] = [];
        const tasks: { email?: string; ok: boolean; err?: string }[] = [];
        const emails: { email?: string; ok: boolean; err?: string }[] = [];

        if (args.create_event && args.event_start && args.event_end) {
          const { addCalendarEvent } = await import("@/lib/google/calendar");
          await Promise.all(
            targets.map(async (t) => {
              try {
                await addCalendarEvent(t.user_id, {
                  title: args.title,
                  start: args.event_start!,
                  end: args.event_end!,
                  location: args.event_location ?? undefined,
                  description: `${args.body}\n\n— Broadcast from ${actorName}`,
                });
                events.push({ email: t.email, ok: true });
              } catch (e) {
                events.push({
                  email: t.email,
                  ok: false,
                  err: e instanceof Error ? e.message : "failed",
                });
              }
            }),
          );
        }

        if (args.create_task && args.task_title) {
          await Promise.all(
            targets.map(async (t) => {
              try {
                await addTask(t.user_id, args.task_title!, args.task_due ?? undefined);
                tasks.push({ email: t.email, ok: true });
              } catch (e) {
                tasks.push({
                  email: t.email,
                  ok: false,
                  err: e instanceof Error ? e.message : "failed",
                });
              }
            }),
          );
        }

        if (args.send_email) {
          const { sendEmail } = await import("@/lib/google/gmail");
          await Promise.all(
            targets.map(async (t) => {
              if (!t.email) return;
              try {
                await sendEmail(userId, {
                  to: t.email,
                  subject: `[Team] ${args.title}`,
                  body: `${args.body}\n\n— ${actorName} via Sigap`,
                });
                emails.push({ email: t.email, ok: true });
              } catch (e) {
                emails.push({
                  email: t.email,
                  ok: false,
                  err: e instanceof Error ? e.message : "failed",
                });
              }
            }),
          );
        }

        return {
          ok: true,
          recipients: targets.length,
          notifications_inserted: targets.length,
          events,
          tasks,
          emails,
        };
      },
    }),

    list_notifications: tool({
      description:
        "Get the current user's in-app notifications (task assignments, mentions, etc). Use when user asks 'ada notif baru ga', 'siapa yang assign task ke gue', 'check notifications'. Unread first.",
      inputSchema: z.object({
        unread_only: z.boolean().nullable().optional(),
      }),
      execute: async ({ unread_only }) => {
        const sb = supabaseAdmin();
        let q = sb
          .from("notifications")
          .select("id, kind, title, body, link, read_at, created_at, actor_id, users:actor_id(name, email)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (unread_only) q = q.is("read_at", null);
        const { data } = await q;
        return (data ?? []).map((n) => {
          const u = n.users as { name?: string; email?: string } | null;
          return {
            id: n.id,
            kind: n.kind,
            title: n.title,
            body: n.body,
            from: u?.name || u?.email || "system",
            read: Boolean(n.read_at),
            created_at: n.created_at,
          };
        });
      },
    }),

    list_team_members: tool({
      description:
        "List members of the user's organization (name, email, role). Use whenever the user says 'email tim', 'kirim ke tim', 'bcc semua member', 'siapa aja di tim gue', or similar — you need this to know the recipient email addresses. Returns empty list if the user is not in any organization; in that case tell the user they need to create/join an org first at /team.",
      inputSchema: z.object({
        role: z
          .enum(["owner", "manager", "member"])
          .nullable()
          .optional()
          .describe("Filter by role. Omit to list everyone."),
      }),
      execute: async ({ role }) => {
        const sb = supabaseAdmin();
        const { data: myMemberships } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId);
        const orgIds = (myMemberships ?? []).map((m) => m.org_id);
        if (orgIds.length === 0) {
          return {
            members: [],
            note: "User is not a member of any organization yet.",
          };
        }
        let q = sb
          .from("org_members")
          .select("user_id, role, org_id, users:user_id(name, email)")
          .in("org_id", orgIds);
        if (role) q = q.eq("role", role);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const members = (data ?? []).map((row) => {
          const u = row.users as { name?: string; email?: string } | null;
          return {
            name: u?.name ?? "",
            email: u?.email ?? "",
            role: row.role,
            org_id: row.org_id,
          };
        });
        return { count: members.length, members };
      },
    }),

    get_notes: tool({
      description:
        "Retrieve saved memories — the user's private notes PLUS any 'team' notes from their organization (if they're in one). Filter by type: 'user', 'feedback', 'project', 'reference'. Use type='user' when asked 'siapa gue'. Returns each note with an 'author' field (the user's own name for private notes, or the teammate who wrote it for team notes) so you can attribute facts correctly.",
      inputSchema: z.object({
        limit: z.number().nullable().optional(),
        type: z
          .enum(["general", "user", "feedback", "project", "reference"])
          .nullable()
          .optional(),
        scope: z
          .enum(["all", "private", "team"])
          .nullable()
          .optional()
          .describe("Default 'all'. Filter to 'private' or 'team' only."),
      }),
      execute: async ({ limit, type, scope }) => {
        const sb = supabaseAdmin();
        const { data: membership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .maybeSingle();
        const orgId = membership?.org_id ?? null;

        const wantPrivate = !scope || scope === "all" || scope === "private";
        const wantTeam = (!scope || scope === "all" || scope === "team") && orgId;

        const results: Array<{
          content: string;
          type: string;
          visibility: string;
          author: string;
          created_at: string;
        }> = [];

        if (wantPrivate) {
          let q = sb
            .from("notes")
            .select("content, type, visibility, created_at")
            .eq("user_id", userId)
            .eq("visibility", "private")
            .order("created_at", { ascending: false })
            .limit(limit ?? 20);
          if (type) q = q.eq("type", type);
          const { data } = await q;
          (data ?? []).forEach((n) =>
            results.push({ ...n, author: "you" }),
          );
        }

        if (wantTeam) {
          let q = sb
            .from("notes")
            .select("content, type, visibility, created_at, user_id, users:user_id(name, email)")
            .eq("org_id", orgId)
            .eq("visibility", "team")
            .order("created_at", { ascending: false })
            .limit(limit ?? 20);
          if (type) q = q.eq("type", type);
          const { data } = await q;
          (data ?? []).forEach((n) => {
            const u = n.users as { name?: string; email?: string } | null;
            results.push({
              content: n.content,
              type: n.type,
              visibility: n.visibility,
              author: u?.name || u?.email || "teammate",
              created_at: n.created_at,
            });
          });
        }

        results.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return results.slice(0, limit ?? 20);
      },
    }),

    create_team: tool({
      description:
        "Create a new team/organization. The current user becomes the owner. Use when the user says 'bikin tim X', 'create team X', 'buat organisasi X'. Returns the new org_id which you can pass to invite_to_team in the same conversation.",
      inputSchema: z.object({
        name: z.string().describe("Team/organization name, e.g. 'Aboy'"),
      }),
      execute: async ({ name }) => {
        const trimmed = name.trim();
        if (!trimmed) return { error: "Name required" };
        const slug =
          trimmed
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") +
          "-" +
          crypto.randomBytes(3).toString("hex");

        const sb = supabaseAdmin();
        const { data: org, error } = await sb
          .from("organizations")
          .insert({ name: trimmed, slug, owner_id: userId })
          .select("id, name")
          .single();
        if (error || !org) {
          return { error: error?.message || "Failed to create team" };
        }
        await sb.from("org_members").insert({
          org_id: org.id,
          user_id: userId,
          role: "owner",
          share_with_manager: true,
        });
        return { ok: true, org_id: org.id, name: org.name };
      },
    }),

    invite_to_team: tool({
      description:
        "Invite someone to a team by email. Sends an invite email with a join link. Requires the org_id (get it from create_team or list_team_members). Use when the user says 'invite X', 'undang X', 'tambahkan X ke tim'. Caller must be owner or manager of the team.",
      inputSchema: z.object({
        email: z.string().describe("Invitee's email address"),
        org_id: z.string().describe("Target team's org_id"),
        role: z
          .enum(["member", "manager"])
          .nullable()
          .optional()
          .describe("Role to assign. Default 'member'."),
      }),
      execute: async ({ email, org_id, role }) => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !org_id) {
          return { error: "email and org_id required" };
        }
        const sb = supabaseAdmin();
        const { data: member } = await sb
          .from("org_members")
          .select("role")
          .eq("org_id", org_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!member || (member.role !== "owner" && member.role !== "manager")) {
          return { error: "You must be an owner or manager of this team to invite." };
        }
        const finalRole = role || "member";
        const token = crypto.randomBytes(24).toString("hex");
        const { error } = await sb.from("org_invites").insert({
          org_id,
          email: cleanEmail,
          role: finalRole,
          manager_id: finalRole === "member" ? userId : null,
          token,
        });
        if (error) return { error: error.message };

        const [{ data: inviter }, { data: org }] = await Promise.all([
          sb.from("users").select("name, email").eq("id", userId).maybeSingle(),
          sb.from("organizations").select("name").eq("id", org_id).maybeSingle(),
        ]);
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || "https://cowork-gilt.vercel.app";
        const inviteUrl = `${baseUrl}/invite/${token}`;
        const inviterName = inviter?.name || inviter?.email || "Someone";
        const orgName = org?.name || "a team";
        const subject = `${inviterName} invited you to join ${orgName} on Sigap`;
        const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #6366f1, #22d3ee); height: 4px; border-radius: 2px; margin-bottom: 24px;"></div>
      <h1 style="color: #0f172a; font-size: 24px; margin-bottom: 8px;">You're invited to ${escapeHtml(orgName)}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.6;">
        <strong>${escapeHtml(inviterName)}</strong> invited you to join their team on <strong>Sigap</strong> — an AI Chief of Staff that helps teams stay in sync without interruptions.
      </p>
      <div style="margin: 32px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Accept invite
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        Or paste this link in your browser:<br>
        <span style="color: #6366f1; word-break: break-all;">${inviteUrl}</span>
      </p>
    </div>
  `;
        try {
          await sendHtmlEmail(userId, {
            to: cleanEmail,
            subject,
            html,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return {
            invite_created: true,
            email_sent: false,
            warning: `Invite row created but Gmail send failed: ${msg}. Tell the user explicitly and share this link: ${inviteUrl}`,
            invite_url: inviteUrl,
          };
        }
        return {
          ok: true,
          email: cleanEmail,
          role: finalRole,
          sent_via: "gmail",
        };
      },
    }),
  };
}
