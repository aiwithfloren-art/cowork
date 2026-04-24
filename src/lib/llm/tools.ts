import { tool } from "ai";
import { z } from "zod";
import crypto from "crypto";
import { sendHtmlEmail } from "@/lib/google/gmail";
import {
  slugify,
  hardenSystemPrompt,
  checkCreateLimits,
  ALL_TOOL_SLUGS as AGENT_ALL_TOOL_SLUGS,
} from "./agent-intercept";
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
import { readDoc, createDoc } from "@/lib/google/docs";
import { shareFile, type DriveRole } from "@/lib/google/drive";
import { listRecentEmails, readEmail, sendEmail } from "@/lib/google/gmail";
import { webSearch } from "@/lib/web/search";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkApproval, pendingApprovalResult } from "./approvals";
import { safeFetch } from "@/lib/http/safe-fetch";
import {
  listRepos as ghListRepos,
  createRepo as ghCreateRepo,
  readFile as ghReadFile,
  writeFile as ghWriteFile,
  writeFilesBatch as ghWriteFilesBatch,
  listCommits as ghListCommits,
  getCommitDiff as ghGetCommitDiff,
  createPullRequest as ghCreatePR,
  listOpenPRs as ghListOpenPRs,
  commentOnPR as ghCommentOnPR,
  getGithubLogin,
} from "@/lib/github/tools";

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
        const gate = await checkApproval({
          userId,
          toolName: "send_email",
          toolArgs: { to, subject, body, cc, bcc },
          summary: `Kirim email ke ${to} — "${subject}"`,
        });
        if (gate.gated) {
          return pendingApprovalResult(
            gate.approvalId,
            `kirim email ke ${to}`,
          );
        }
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
        const apiKey = process.env.ATTENDEE_API_KEY;
        if (!apiKey) {
          return {
            error:
              "Meeting bot not configured. Admin must set ATTENDEE_API_KEY in environment.",
          };
        }
        try {
          const res = await fetch("https://app.attendee.dev/api/v1/bots", {
            method: "POST",
            headers: {
              Authorization: `Token ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              meeting_url,
              bot_name: bot_name || "Sigap Notetaker",
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            return {
              error: `Attendee API ${res.status}: ${text.slice(0, 200)}`,
            };
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
        const apiKey = process.env.ATTENDEE_API_KEY;
        if (!apiKey) return { error: "ATTENDEE_API_KEY not set" };
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
          const statusRes = await fetch(
            `https://app.attendee.dev/api/v1/bots/${id}`,
            { headers: { Authorization: `Token ${apiKey}` } },
          );
          if (!statusRes.ok) {
            return { error: `Attendee API ${statusRes.status}` };
          }
          const bot = (await statusRes.json()) as {
            state?: string;
            transcription_state?: string;
          };
          if (bot.state !== "ended") {
            return {
              status: bot.state || "unknown",
              note: "Meeting not finished yet. Try again after it ends.",
            };
          }
          if (bot.transcription_state !== "complete") {
            return {
              status: "ended",
              transcription_state: bot.transcription_state,
              note: "Meeting ended but transcript is still processing. Try again in ~30s.",
            };
          }
          const transRes = await fetch(
            `https://app.attendee.dev/api/v1/bots/${id}/transcript`,
            { headers: { Authorization: `Token ${apiKey}` } },
          );
          if (!transRes.ok) {
            return {
              error: `Attendee transcript fetch ${transRes.status}`,
            };
          }
          const segments = (await transRes.json()) as Array<{
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
          await sb
            .from("meeting_bots")
            .update({ status: "done", transcript: plain.slice(0, 50000) })
            .eq("bot_id", id);
          return {
            ok: true,
            transcript_excerpt: plain.slice(0, 4000),
            note:
              "Full transcript stored. You (the AI) should now write a concise summary from the excerpt: key decisions, action items, next steps. Extract and call tools for anything actionable: add_calendar_event for meetings mentioned, assign_task_to_member for delegated work, save_note for durable context.",
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

    generate_carousel_html: tool({
      description:
        "Generate a visually polished Instagram/LinkedIn carousel as an HTML artifact. Use when the user asks for 'bikin carousel', 'PPT style post', 'bikin slide IG', 'carousel content', etc. Each slide is code-rendered (gradient background + typography + layout), NOT AI-generated photos — cheap and brand-consistent. Returns a public URL the user can open in a new tab to preview all slides side-by-side, then screenshot each one for posting. Always pass 3-7 slides. Ideal for hook/problem/solution/CTA style content, tips threads, before-after comparisons. For photo-heavy content use generate_image instead.",
      inputSchema: z.object({
        title: z
          .string()
          .describe(
            "Short title of the carousel (used in the HTML <title> and as filename hint). Example: 'Resume Rehab Carousel'",
          ),
        slides: z
          .array(
            z.object({
              headline: z.string().describe(
                "Big bold text at top of the slide — the hook or punchline of this slide. Keep under 80 chars for readability.",
              ),
              body: z
                .string()
                .describe(
                  "Supporting text — 1-3 sentences, max ~200 chars. Use \\n for line breaks.",
                ),
              cta: z
                .string()
                .nullable()
                .optional()
                .describe(
                  "Optional small text at bottom (e.g. 'Swipe →', '2/5', 'acme.co.id'). Leave null for no CTA.",
                ),
            }),
          )
          .min(2)
          .max(10)
          .describe("Array of 2-10 slides."),
        palette: z
          .enum(["indigo", "emerald", "amber", "rose", "slate"])
          .nullable()
          .optional()
          .describe(
            "Color palette — pick based on vibe. 'indigo' (professional, trust), 'emerald' (growth, money), 'amber' (bold, energy), 'rose' (creative, personal), 'slate' (minimalist). Default 'indigo'.",
          ),
        aspect_ratio: z
          .enum(["1:1", "4:5", "9:16"])
          .nullable()
          .optional()
          .describe(
            "Slide dimension. '1:1' = Instagram feed default, '4:5' = Instagram portrait, '9:16' = Story/Reels. Default '1:1'.",
          ),
      }),
      execute: async ({ title, slides, palette, aspect_ratio }) => {
        try {
          const finalPalette = palette ?? "indigo";
          const finalAspect = aspect_ratio ?? "1:1";

          // Persist the slide manifest as JSON — the /api/carousel/[id]/slide/[idx]
          // PNG endpoint reads this to render each slide on demand.
          const manifestId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
          const manifest = {
            title,
            palette: finalPalette,
            aspect_ratio: finalAspect,
            slides,
          };
          const sb = supabaseAdmin();
          const BUCKET = "sigap-images";
          const manifestPath = `carousel-manifests/${manifestId}.json`;

          const uploadManifest = async () =>
            sb.storage.from(BUCKET).upload(
              manifestPath,
              Buffer.from(JSON.stringify(manifest), "utf-8"),
              {
                contentType: "application/json",
                cacheControl: "31536000",
                upsert: false,
              },
            );
          let up = await uploadManifest();
          if (up.error && /Bucket not found/i.test(up.error.message)) {
            await sb.storage.createBucket(BUCKET, { public: true });
            up = await uploadManifest();
          }
          if (up.error) {
            return { error: `Manifest upload failed: ${up.error.message}` };
          }

          // Build absolute PNG URLs. NEXTAUTH_URL is set in every deployment,
          // safe fallback to localhost for dev runs.
          const host =
            process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
            "http://localhost:3000";
          const pngUrls = slides.map(
            (_, i) => `${host}/api/carousel/${manifestId}/slide/${i}.png`,
          );

          return {
            manifest_id: manifestId,
            slide_count: slides.length,
            palette: finalPalette,
            aspect_ratio: finalAspect,
            png_urls: pngUrls,
            note: "Slides rendered on-demand as real PNG images via next/og. Embed each URL as a markdown image in your reply: ![Slide 1](url). The chat UI renders them with a Download button. Each PNG is cached immutable so Instagram re-uploads don't re-render.",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Carousel generation failed",
          };
        }
      },
    }),

    create_artifact: tool({
      description:
        "Save a drafted deliverable as its own artifact with a permanent URL. ALWAYS use this instead of sending long-form drafts in chat when the user asks for: a social-media post/caption, a draft email, a proposal, any content piece they'll want to copy/edit/share later. Returns an artifact URL; in your chat reply, just link to it with a 1-line summary — do NOT paste the body again. Types: 'post' (social media content), 'email' (draft email with subject+body), 'proposal' (client pitch/scope doc), 'caption' (short caption or copy snippet), 'document' (generic long-form fallback).",
      inputSchema: z.object({
        type: z
          .enum(["post", "email", "proposal", "caption", "document"])
          .describe("Kind of deliverable — picks the rendering template."),
        title: z
          .string()
          .describe(
            "Short human-readable title. Used as filename/header. Example: 'Promo Ramadhan IG post', 'Follow-up email ke Budi'.",
          ),
        body_markdown: z
          .string()
          .describe(
            "Full body of the deliverable in markdown. For posts: the caption text. For emails: the email body. For proposals: the full proposal text. Include line breaks and formatting as needed.",
          ),
        platform: z
          .enum([
            "instagram",
            "linkedin",
            "twitter",
            "whatsapp",
            "facebook",
            "tiktok",
            "email",
          ])
          .nullable()
          .optional()
          .describe(
            "Target platform, if applicable. Helps pick preview style (e.g. IG post shows square preview, LinkedIn shows feed-style).",
          ),
        subject: z
          .string()
          .nullable()
          .optional()
          .describe("Email subject line. Required for type='email'."),
        recipient: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Email recipient hint (name or email). Used in email preview header.",
          ),
        hashtags: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Hashtags for social posts. Pass without '#' — UI will render them.",
          ),
        cta: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Call-to-action text. Example: 'DM us to order', 'Link in bio', 'Reply to this email'.",
          ),
        client: z
          .string()
          .nullable()
          .optional()
          .describe("Client name for proposals. Shows in proposal header."),
      }),
      execute: async ({
        type,
        title,
        body_markdown,
        platform,
        subject,
        recipient,
        hashtags,
        cta,
        client,
      }) => {
        const sb = supabaseAdmin();
        const meta: Record<string, unknown> = {};
        if (subject) meta.subject = subject;
        if (recipient) meta.recipient = recipient;
        if (hashtags && hashtags.length > 0) meta.hashtags = hashtags;
        if (cta) meta.cta = cta;
        if (client) meta.client = client;

        const { data, error } = await sb
          .from("artifacts")
          .insert({
            user_id: userId,
            type,
            title: title.slice(0, 200),
            body_markdown,
            platform: platform ?? null,
            meta,
          })
          .select("id")
          .single();
        if (error) return { error: error.message };

        const host =
          process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
          "http://localhost:3000";
        const url = `${host}/artifacts/${data.id}`;
        return {
          artifact_id: data.id,
          url,
          type,
          title,
          note: `Artifact saved. In your chat reply, send ONLY a 1-2 sentence summary + the link [📄 ${title}](/artifacts/${data.id}). Do NOT paste the body_markdown again — the artifact page shows it. Example reply: "✅ Sudah gue draftin postnya: [📄 ${title}](/artifacts/${data.id}) — lo bisa Copy/Edit/regenerate dari sana."`,
        };
      },
    }),

    create_google_doc: tool({
      description:
        "Create a NEW Google Doc in the user's Drive with the given title and content. Use when the user says 'bikin Google Doc', 'masukkan ke Google Docs', 'save as Google Doc', 'bikin doc buat X'. Content is markdown (headings, bullets, bold, italic, links all preserved after Drive auto-converts HTML→Doc). Returns the Doc URL — you can chain with send_email to deliver the link. After calling this tool, confirm with the doc URL; do NOT claim 'doc created' without calling it.",
      inputSchema: z.object({
        title: z
          .string()
          .describe(
            "Title of the Doc. Used as filename in Drive. Keep under 200 chars.",
          ),
        content_markdown: z
          .string()
          .describe(
            "Full content of the doc in markdown. Supports # headings, **bold**, *italic*, bullet lists (- item), numbered lists (1. item), [links](url), inline `code`. Structure properly — don't dump one giant paragraph.",
          ),
      }),
      execute: async ({ title, content_markdown }) => {
        try {
          const { id, url } = await createDoc(userId, title, content_markdown);
          return {
            ok: true,
            doc_id: id,
            url,
            title,
            note: `Google Doc created. In your reply, link the doc directly: "[📄 ${title}](${url})". If the user asked for the link to be emailed, call send_email NEXT with the doc URL.`,
          };
        } catch (e) {
          return {
            error: `Gagal bikin Google Doc: ${e instanceof Error ? e.message : "unknown"}. User mungkin perlu re-authorize Google OAuth kalau token-nya expired.`,
          };
        }
      },
    }),

    github_list_repos: tool({
      description:
        "List the user's GitHub repositories. Use when the user asks 'list my repos', 'apa aja repo gw', 'show my projects'. Returns full_name (owner/repo), URL, default branch.",
      inputSchema: z.object({
        include_private: z
          .boolean()
          .nullable()
          .optional()
          .describe("Include private repos. Default true."),
        limit: z
          .number()
          .nullable()
          .optional()
          .describe("Max repos to return (1-100). Default 30."),
      }),
      execute: async ({ include_private, limit }) => {
        try {
          const repos = await ghListRepos(userId, {
            include_private: include_private ?? true,
            limit: limit ?? 30,
          });
          return { ok: true, count: repos.length, repos };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to list repos",
          };
        }
      },
    }),

    github_create_repo: tool({
      description:
        "Create a new GitHub repository. Use when the user says 'bikin repo X', 'create repo', 'new project on GitHub'. Returns the full_name + URL. Defaults to private + auto-init (README).",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Repo name (no spaces — use hyphens). Example 'landing-v1'."),
        description: z
          .string()
          .nullable()
          .optional(),
        private: z
          .boolean()
          .nullable()
          .optional()
          .describe("Default true. Set false for public."),
        gitignore_template: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Language template for initial .gitignore. Example 'Node', 'Python', 'Go'.",
          ),
      }),
      execute: async ({ name, description, private: isPrivate, gitignore_template }) => {
        try {
          const r = await ghCreateRepo(userId, {
            name,
            description: description ?? undefined,
            private: isPrivate ?? true,
            gitignore_template: gitignore_template ?? undefined,
          });
          return {
            ok: true,
            full_name: r.full_name,
            html_url: r.html_url,
            default_branch: r.default_branch,
            note: `Repo created. Next: use github_write_file to add code. owner = full_name.split('/')[0], repo = full_name.split('/')[1].`,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to create repo",
          };
        }
      },
    }),

    github_read_file: tool({
      description:
        "Read a file from a GitHub repo. Use when the user says 'baca file X di repo Y', 'show me the contents of src/app.ts', 'review code at ...'.",
      inputSchema: z.object({
        owner: z.string().describe("Repo owner (username or org)"),
        repo: z.string().describe("Repo name"),
        path: z.string().describe("File path, e.g. 'src/index.ts'"),
        ref: z
          .string()
          .nullable()
          .optional()
          .describe("Branch/tag/sha. Default = default branch."),
      }),
      execute: async ({ owner, repo, path, ref }) => {
        try {
          const f = await ghReadFile(userId, {
            owner,
            repo,
            path,
            ref: ref ?? undefined,
          });
          return {
            ok: true,
            path: f.path,
            size: f.size,
            content: f.content.slice(0, 20000),
            truncated: f.content.length > 20000,
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to read file" };
        }
      },
    }),

    github_write_file: tool({
      description:
        "Create or update a file in a GitHub repo. Use for 'bikin file X', 'tambah feature Y', 'push code Z'. If updating, this tool auto-fetches the current SHA. Keep commit messages short + meaningful. To bootstrap a new project, call this multiple times — once per file.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().describe("File path, e.g. 'package.json' or 'src/app.ts'"),
        content: z.string().describe("Full file content (UTF-8)"),
        message: z
          .string()
          .describe("Commit message. Conventional commit style preferred."),
        branch: z
          .string()
          .nullable()
          .optional()
          .describe("Branch to commit to. Default = default branch."),
      }),
      execute: async ({ owner, repo, path, content, message, branch }) => {
        try {
          const r = await ghWriteFile(userId, {
            owner,
            repo,
            path,
            content,
            message,
            branch: branch ?? undefined,
          });
          return { ok: true, commit_sha: r.commit_sha, html_url: r.html_url };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to write file" };
        }
      },
    }),

    github_write_files_batch: tool({
      description:
        "Commit MANY files to a GitHub repo in a SINGLE atomic commit using the Git Tree API. STRONGLY PREFERRED over repeated github_write_file when scaffolding or bootstrapping a project (Next.js app, landing page, etc). One call = one commit with all files. ~10x faster than N sequential github_write_file calls and avoids serverless timeout. Use for: initial scaffold, adding a feature that spans multiple files, refactors. Only text/UTF-8 files supported (no binaries). Tip: the very first scaffold commit can overwrite the auto-generated README.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        files: z
          .array(
            z.object({
              path: z.string().describe("Repo-relative path, e.g. 'package.json' or 'src/app/page.tsx'"),
              content: z.string().describe("Full UTF-8 file content"),
            }),
          )
          .min(1)
          .describe("List of files to create/update in one commit"),
        message: z
          .string()
          .describe("Commit message. Conventional commit style preferred, e.g. 'chore: scaffold Next.js app'."),
        branch: z
          .string()
          .nullable()
          .optional()
          .describe("Branch to commit to. Default = default branch."),
      }),
      execute: async ({ owner, repo, files, message, branch }) => {
        try {
          const r = await ghWriteFilesBatch(userId, {
            owner,
            repo,
            files,
            message,
            branch: branch ?? undefined,
          });
          return {
            ok: true,
            commit_sha: r.commit_sha,
            html_url: r.html_url,
            files_count: r.files_count,
            branch: r.branch,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to write files batch",
          };
        }
      },
    }),

    schedule_deploy_watcher: tool({
      description:
        "Queue a background watcher for a deploy that's still BUILDING after your inline polling cap. The watcher runs every minute, polls the deploy status, and pushes a Slack DM + in-app notification to the user when the deploy reaches READY / ERROR / CANCELED. Use this INSTEAD of telling the user to 'check later' — it lets you end the chat turn cleanly while still guaranteeing the user gets notified when the deploy finishes. Call this after your 3rd inline poll shows non-terminal status.",
      inputSchema: z.object({
        provider: z
          .enum(["vercel"])
          .describe("Deploy provider — currently only 'vercel' supported"),
        deployment_id: z
          .string()
          .describe("Provider-specific deployment ID (Vercel's `dpl_xxx` style, returned from POST /v13/deployments)"),
        project_name: z
          .string()
          .describe("Human-readable project name for the notification text, e.g. 'halolearn' or 'acme-landing'"),
        expected_url: z
          .string()
          .nullable()
          .optional()
          .describe("The deployment's preview URL (https://...). Included in the notification so user can click through."),
      }),
      execute: async ({ provider, deployment_id, project_name, expected_url }) => {
        try {
          const { data, error } = await supabaseAdmin()
            .from("background_checks")
            .insert({
              user_id: userId,
              kind: `${provider}_deploy`,
              payload: {
                deployment_id,
                project_name,
                expected_url: expected_url ?? null,
              },
            })
            .select("id")
            .single();
          if (error) return { error: error.message };
          return {
            ok: true,
            id: data.id,
            note:
              "Watcher queued. User akan dapet Slack DM + notif in-app pas deploy ready/error. Cron polling setiap 1 menit.",
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to schedule watcher",
          };
        }
      },
    }),

    github_list_commits: tool({
      description:
        "List recent commits on a repo. Use for daily reviewer: 'commit apa aja hari ini di repo X', 'what was pushed in the last 24h'. Pass since='YYYY-MM-DDTHH:MM:SSZ' to filter.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        since: z
          .string()
          .nullable()
          .optional()
          .describe("ISO datetime cutoff. Example '2026-04-22T00:00:00Z'"),
        branch: z.string().nullable().optional(),
        author: z
          .string()
          .nullable()
          .optional()
          .describe("GitHub login to filter by"),
        limit: z.number().nullable().optional(),
      }),
      execute: async (args) => {
        try {
          const commits = await ghListCommits(userId, {
            owner: args.owner,
            repo: args.repo,
            since: args.since ?? undefined,
            branch: args.branch ?? undefined,
            author: args.author ?? undefined,
            limit: args.limit ?? 20,
          });
          return { ok: true, count: commits.length, commits };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to list commits" };
        }
      },
    }),

    github_get_commit_diff: tool({
      description:
        "Get the file-level diff for a single commit. Use as reviewer to inspect WHAT changed. Returns per-file patches (capped 4KB each). Combine with github_list_commits to walk recent commits.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        sha: z.string().describe("Full or short commit SHA"),
      }),
      execute: async (args) => {
        try {
          const diff = await ghGetCommitDiff(userId, args);
          return { ok: true, ...diff };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to get diff" };
        }
      },
    }),

    github_create_pr: tool({
      description:
        "Open a pull request from one branch into another. Coder uses this after pushing a feature branch.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string().describe("Markdown body. Summarize what changed + why."),
        head: z.string().describe("Source branch, e.g. 'feat/dark-mode'"),
        base: z.string().describe("Target branch, usually 'main'"),
      }),
      execute: async (args) => {
        try {
          const pr = await ghCreatePR(userId, args);
          return { ok: true, number: pr.number, html_url: pr.html_url };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to create PR" };
        }
      },
    }),

    github_list_open_prs: tool({
      description:
        "List open pull requests on a repo. Use as reviewer to check what's pending.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        limit: z.number().nullable().optional(),
      }),
      execute: async ({ owner, repo, limit }) => {
        try {
          const prs = await ghListOpenPRs(userId, {
            owner,
            repo,
            limit: limit ?? 20,
          });
          return { ok: true, count: prs.length, prs };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed to list PRs" };
        }
      },
    }),

    github_comment_on_pr: tool({
      description:
        "Post a review comment on a PR. Use as reviewer to deliver findings. Markdown supported.",
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        pr_number: z.number(),
        body: z.string().describe("Markdown comment body"),
      }),
      execute: async (args) => {
        try {
          const c = await ghCommentOnPR(userId, args);
          return { ok: true, html_url: c.html_url };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to post PR comment",
          };
        }
      },
    }),

    get_credential: tool({
      description:
        "Fetch an API token or credential the user previously saved for a third-party service. Use BEFORE calling http_request against a service that needs auth. Returns the raw token string — include it in the next http_request's Authorization header. Common services: 'vercel', 'linear', 'notion', 'stripe', 'openai', 'anthropic'. Service names are case-insensitive and user-chosen — if first lookup fails, list_credentials to see what's actually available.",
      inputSchema: z.object({
        service: z
          .string()
          .describe(
            "Service slug (e.g. 'vercel', 'linear', 'notion'). Must match what the user saved in /settings/connectors.",
          ),
      }),
      execute: async ({ service }) => {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("connectors")
          .select("access_token, external_account_label, metadata")
          .eq("user_id", userId)
          .eq("provider", service.toLowerCase())
          .is("org_id", null)
          .maybeSingle();
        if (!data?.access_token) {
          return {
            error: `No token saved for '${service}'. Tell the user to open /settings/connectors → "Add API Token" → paste their ${service} token.`,
          };
        }
        return {
          ok: true,
          service: service.toLowerCase(),
          token: data.access_token as string,
          label: (data.external_account_label as string | null) ?? null,
          note: "Include this token in the next http_request. Typical header: Authorization: Bearer <token>. Never echo the token back to the user in your reply.",
        };
      },
    }),

    list_credentials: tool({
      description:
        "List all API tokens the user has saved (service names only — tokens never returned). Use when you don't know what services the user has configured, or to tell the user what's available.",
      inputSchema: z.object({}),
      execute: async () => {
        const sb = supabaseAdmin();
        const { data } = await sb
          .from("connectors")
          .select("provider, external_account_label, created_at")
          .eq("user_id", userId)
          .is("org_id", null);
        const services = (data ?? []).map((r) => ({
          service: r.provider as string,
          label: (r.external_account_label as string | null) ?? null,
        }));
        return { ok: true, count: services.length, services };
      },
    }),

    save_credential: tool({
      description:
        "Save an API token for a third-party service (e.g. Vercel, Linear, Notion, Stripe). Use when the user PASTES a token in chat to authorize Sigap for that service. Do NOT echo the token back in your reply. After saving, warn the user to delete their chat message if they want the token removed from chat history. Reserved slugs that have dedicated OAuth (google, slack, github, notion) must NOT use this — tell the user to use /settings/connectors instead.",
      inputSchema: z.object({
        service: z
          .string()
          .describe(
            "Service slug, lowercase (e.g. 'vercel', 'linear', 'stripe')",
          ),
        token: z
          .string()
          .describe("The API token the user pasted. Passed verbatim."),
        label: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Optional human label (e.g. 'Personal account'). Defaults to none.",
          ),
      }),
      execute: async ({ service, token, label }) => {
        const slug = service.toLowerCase().trim();
        const RESERVED = new Set(["google", "slack", "github", "composio"]);
        if (RESERVED.has(slug)) {
          return {
            error: `'${slug}' uses dedicated OAuth — tell the user to open /settings/connectors and click Connect ${slug} instead of pasting a token.`,
          };
        }
        if (!/^[a-z0-9_-]{2,40}$/.test(slug)) {
          return {
            error:
              "service slug must be 2-40 chars: lowercase, digits, -, _",
          };
        }
        if (!token || token.trim().length < 8) {
          return { error: "Token too short — valid tokens usually 20+ chars." };
        }

        const sb = supabaseAdmin();
        const { data: existing } = await sb
          .from("connectors")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", slug)
          .is("org_id", null)
          .maybeSingle();

        const payload = {
          user_id: userId,
          provider: slug,
          access_token: token.trim(),
          external_account_label:
            typeof label === "string" && label.trim()
              ? label.trim().slice(0, 120)
              : null,
          metadata: { source: "chat_paste" },
          updated_at: new Date().toISOString(),
        };

        const err = existing
          ? (await sb.from("connectors").update(payload).eq("id", existing.id))
              .error
          : (await sb.from("connectors").insert(payload)).error;
        if (err) {
          return { error: err.message };
        }
        return {
          ok: true,
          service: slug,
          note: `Token saved for '${slug}'. You may now call http_request with get_credential('${slug}'). IMPORTANT: warn the user that their chat message contained the raw token — they can delete that message from Telegram/Slack if they want it gone from chat history. Do NOT echo the token back.`,
        };
      },
    }),

    install_skill: tool({
      description:
        "Install an AI employee template from the org's Skill Hub as a personal agent for the user. Use when the user says 'install <name>', 'aktifin <name>', 'tambahin agent <name>', 'setup <role>'. Fuzzy-matches the template name. After install, user can @mention the new agent in web/Telegram/Slack. If ambiguous, call list_installable_skills first to show options.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Template name or close match. Examples: 'Coder', 'Code Reviewer', 'HR Onboarding', 'sales', 'content'.",
          ),
      }),
      execute: async ({ name }) => {
        const sb = supabaseAdmin();
        const { data: membership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (!membership?.org_id) {
          return {
            error:
              "User is not in any org. Skill Hub requires an org — tell the user to create/join one at /team first.",
          };
        }

        const { data: templates } = await sb
          .from("org_agent_templates")
          .select(
            "id, name, emoji, description, system_prompt, enabled_tools, objectives, llm_override_provider, llm_override_model, default_schedule, install_count",
          )
          .eq("org_id", membership.org_id);
        if (!templates || templates.length === 0) {
          return { error: "No templates published in this org's Skill Hub." };
        }

        // Fuzzy match: exact (case-insensitive) → contains → word-start match
        const lower = name.toLowerCase().trim();
        let tmpl = templates.find(
          (t) => (t.name as string).toLowerCase() === lower,
        );
        if (!tmpl) {
          tmpl = templates.find((t) =>
            (t.name as string).toLowerCase().includes(lower),
          );
        }
        if (!tmpl) {
          tmpl = templates.find((t) =>
            lower
              .split(/\s+/)
              .some((word) =>
                (t.name as string).toLowerCase().includes(word),
              ),
          );
        }
        if (!tmpl) {
          return {
            error: `No template matching "${name}". Available: ${templates
              .map((t) => t.name)
              .join(", ")}`,
          };
        }

        // Anti-duplicate: if user already has an agent with this name, bail
        const { data: existing } = await sb
          .from("custom_agents")
          .select("slug")
          .eq("user_id", userId)
          .eq("name", tmpl.name)
          .maybeSingle();
        if (existing) {
          return {
            ok: true,
            already_installed: true,
            slug: existing.slug as string,
            name: tmpl.name,
            note: `${tmpl.name} already installed at /agents/${existing.slug}. Use @${existing.slug} in chat.`,
          };
        }

        // Agent cap check
        const { count } = await sb
          .from("custom_agents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if ((count ?? 0) >= 20) {
          return {
            error: `User already has ${count} agents (max 20). Tell them to delete one first.`,
          };
        }

        // Generate unique slug under this user
        const baseSlug = (tmpl.name as string)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40);
        let slug = baseSlug;
        for (let i = 0; i < 5; i++) {
          const { data: dup } = await sb
            .from("custom_agents")
            .select("id")
            .eq("user_id", userId)
            .eq("slug", slug)
            .maybeSingle();
          if (!dup) break;
          slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
        }

        const { error: insertErr } = await sb.from("custom_agents").insert({
          user_id: userId,
          slug,
          name: tmpl.name,
          emoji: tmpl.emoji ?? null,
          description: tmpl.description ?? null,
          system_prompt: tmpl.system_prompt,
          enabled_tools: tmpl.enabled_tools ?? [],
          objectives: tmpl.objectives ?? [],
          llm_override_provider: tmpl.llm_override_provider ?? null,
          llm_override_model: tmpl.llm_override_model ?? null,
          schedule_cron: tmpl.default_schedule ?? null,
        });
        if (insertErr) {
          return { error: insertErr.message };
        }
        await sb
          .from("org_agent_templates")
          .update({ install_count: (tmpl.install_count as number | null ?? 0) + 1 })
          .eq("id", tmpl.id as string);

        return {
          ok: true,
          slug,
          name: tmpl.name,
          emoji: tmpl.emoji ?? "🤖",
          note: `Installed! Use @${slug} in chat (web, Telegram, or Slack). Or open /agents/${slug} for dedicated chat.`,
        };
      },
    }),

    list_installable_skills: tool({
      description:
        "List all AI employee templates the user can install from their org's Skill Hub. Shows name + description so the user can pick.",
      inputSchema: z.object({}),
      execute: async () => {
        const sb = supabaseAdmin();
        const { data: membership } = await sb
          .from("org_members")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (!membership?.org_id) {
          return { ok: true, count: 0, templates: [] };
        }
        const { data: templates } = await sb
          .from("org_agent_templates")
          .select("name, emoji, description")
          .eq("org_id", membership.org_id)
          .order("install_count", { ascending: false });

        // Also fetch user's already-installed agents to mark them
        const { data: installed } = await sb
          .from("custom_agents")
          .select("name")
          .eq("user_id", userId);
        const installedNames = new Set(
          (installed ?? []).map((a) => a.name as string),
        );

        return {
          ok: true,
          count: (templates ?? []).length,
          templates: (templates ?? []).map((t) => ({
            name: t.name as string,
            emoji: (t.emoji as string | null) ?? "🤖",
            description: (t.description as string | null) ?? "",
            already_installed: installedNames.has(t.name as string),
          })),
        };
      },
    }),

    http_request: tool({
      description:
        "Universal HTTP client for any REST/HTTPS API. Use when there's no dedicated tool for the service the user is asking about (Vercel, Linear, Notion, Stripe, Airtable, Twilio, etc). You compose the URL + method + headers yourself based on the service's API docs. For authenticated endpoints, call get_credential first to fetch the user's token, then pass it in the Authorization header. DO NOT echo the token in your reply. SSRF-guarded: localhost and private IPs blocked. Response capped at 2MB and 20s.",
      inputSchema: z.object({
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
          .describe("HTTP method"),
        url: z.string().describe("Full URL including scheme. Only http/https."),
        headers: z
          .record(z.string(), z.string())
          .nullable()
          .optional()
          .describe(
            "Request headers. Typical: {'Authorization': 'Bearer <token>', 'Content-Type': 'application/json'}",
          ),
        body: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Request body as a string. For JSON, pass JSON.stringify(...) and set Content-Type: application/json.",
          ),
      }),
      execute: async ({ method, url, headers, body }) => {
        try {
          const res = await safeFetch({
            method,
            url,
            headers: headers ?? {},
            body: body ?? undefined,
          });
          // Trim the body for the LLM — responses bigger than ~20KB are
          // rarely useful and eat context. Full body available in logs if needed.
          const maxReply = 20_000;
          const replyBody =
            res.body.length > maxReply
              ? res.body.slice(0, maxReply) + "\n\n[...truncated]"
              : res.body;
          return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            status_text: res.status_text,
            final_url: res.final_url,
            headers: res.headers,
            body: replyBody,
            body_truncated: res.truncated || res.body.length > maxReply,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "http_request failed",
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
        const gate = await checkApproval({
          userId,
          toolName: "assign_task_to_member",
          toolArgs: { member_email, title, due, notes },
          summary: `Kasih task "${title}" ke ${member_email}${due ? ` deadline ${due}` : ""}`,
        });
        if (gate.gated) {
          return pendingApprovalResult(
            gate.approvalId,
            `kasih task "${title}" ke ${member_email}`,
          );
        }
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
        const gate = await checkApproval({
          userId,
          toolName: "broadcast_to_team",
          toolArgs: args as Record<string, unknown>,
          summary: `Broadcast ke tim — "${args.title}"`,
        });
        if (gate.gated) {
          return pendingApprovalResult(
            gate.approvalId,
            `broadcast "${args.title}" ke tim`,
          );
        }
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

    get_member_workload: tool({
      description:
        "Read a teammate's current workload — today's calendar events, this week's events, and open tasks. Use when the user says 'apa kerjaan Budi minggu ini', 'tugas tim', 'workload Sarah', 'jadwal [email]'. Requires: (1) you share an org with the target, (2) the target has enabled share_with_manager. Every call is written to audit_log so the teammate has full visibility into what was queried. Identify the target by email — if the user said a name only, call list_team_members first to find their email. Pass a 'reason' string echoing the user's underlying question so the audit entry is meaningful to the teammate.",
      inputSchema: z.object({
        member_email: z
          .string()
          .describe("The teammate's email address."),
        reason: z
          .string()
          .describe(
            "A short paraphrase of what the user actually wanted to know (e.g. \"checking if Budi is overloaded this week\", \"drafting standup\"). Shown to the teammate in their audit log — be honest and specific.",
          ),
      }),
      execute: async ({ member_email, reason }) => {
        const sb = supabaseAdmin();
        const cleanEmail = member_email.trim().toLowerCase();
        const cleanReason = (reason ?? "").trim().slice(0, 400) ||
          "workload query (no reason provided)";

        const { data: target } = await sb
          .from("users")
          .select("id, name, email")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (!target) {
          return { error: `Tidak ada Sigap user dengan email ${cleanEmail}.` };
        }
        if (target.id === userId) {
          return {
            error:
              "Itu adalah akun kamu sendiri — pakai list_tasks / get_today_schedule / get_week_schedule biasa.",
          };
        }

        // Both viewer and target must share at least one org. Viewer role
        // must be owner/manager in that org. Target must have opted in
        // via share_with_manager.
        const { data: viewerMems } = await sb
          .from("org_members")
          .select("org_id, role")
          .eq("user_id", userId)
          .in("role", ["owner", "manager"]);
        const orgIds = (viewerMems ?? []).map((m) => m.org_id);
        if (orgIds.length === 0) {
          return {
            error:
              "Kamu bukan owner atau manager di org manapun — query workload cuma bisa dari manager.",
          };
        }
        // Find ALL shared orgs between viewer and target, then prefer one
        // where the target has opted in to sharing. Fixes multi-org bug
        // where an arbitrary (possibly non-shared) membership was picked.
        const { data: targetMems } = await sb
          .from("org_members")
          .select("org_id, share_with_manager")
          .eq("user_id", target.id)
          .in("org_id", orgIds);
        if (!targetMems || targetMems.length === 0) {
          return {
            error: `${target.name ?? cleanEmail} bukan member di org kamu.`,
          };
        }
        const targetMem =
          targetMems.find((m) => m.share_with_manager) ?? targetMems[0];
        if (!targetMem.share_with_manager) {
          return {
            error: `${target.name ?? cleanEmail} belum mengaktifkan "share with manager" — minta dia toggle di /team/settings sebelum kamu bisa lihat workload-nya. Privacy by default.`,
          };
        }

        const orgId = targetMem.org_id;

        let today: Awaited<ReturnType<typeof getTodayEvents>> = [];
        let week: Awaited<ReturnType<typeof getWeekEvents>> = [];
        let tasks: Awaited<ReturnType<typeof listTasks>> = [];
        const errors: string[] = [];
        try {
          today = await getTodayEvents(target.id);
        } catch (e) {
          errors.push(`calendar today: ${e instanceof Error ? e.message : "err"}`);
        }
        try {
          week = await getWeekEvents(target.id);
        } catch (e) {
          errors.push(`calendar week: ${e instanceof Error ? e.message : "err"}`);
        }
        try {
          tasks = await listTasks(target.id);
        } catch (e) {
          errors.push(`tasks: ${e instanceof Error ? e.message : "err"}`);
        }

        // Audit — teammate sees who queried what, including the
        // paraphrased reason the LLM supplied on behalf of the user.
        await sb.from("audit_log").insert({
          org_id: orgId,
          actor_id: userId,
          target_id: target.id,
          action: "get_member_workload",
          question: cleanReason,
          answer: JSON.stringify({
            today_count: today.length,
            week_count: week.length,
            task_count: tasks.length,
          }),
        });

        return {
          member: { name: target.name, email: target.email },
          today: today.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
          })),
          week: week.map((e) => ({ title: e.title, start: e.start, end: e.end })),
          open_tasks: tasks.map((t) => ({ title: t.title, due: t.due })),
          ...(errors.length > 0 ? { partial_errors: errors } : {}),
        };
      },
    }),

    get_member_project_brief: tool({
      description:
        "Rich brief of a teammate's project-level activity. Extends get_member_workload with: projects (notes type='project'), AI employee usage, task backlog with overdue/upcoming bucketing. Use when the user asks 'apa project Aninda pegang?', 'Shella masih ada deadline ga?', 'berapa banyak @amore dipake sama tim?', or similar project/member-spanning questions. Requires: viewer is owner/manager AND target has enabled share_with_manager. Every call audits the reason.",
      inputSchema: z.object({
        member_email: z.string().describe("The teammate's email address."),
        reason: z
          .string()
          .describe(
            "Short paraphrase of what the user actually wanted to know — shown in the teammate's audit log.",
          ),
      }),
      execute: async ({ member_email, reason }) => {
        const sb = supabaseAdmin();
        const cleanEmail = member_email.trim().toLowerCase();
        const cleanReason =
          (reason ?? "").trim().slice(0, 400) ||
          "project brief query (no reason provided)";

        // Permissioning — mirrors get_member_workload exactly.
        const { data: target } = await sb
          .from("users")
          .select("id, name, email")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (!target) {
          return { error: `No Sigap user with email ${cleanEmail}.` };
        }
        if (target.id === userId) {
          return {
            error:
              "That's your own account — just check your own projects/tasks directly.",
          };
        }

        const { data: viewerMems } = await sb
          .from("org_members")
          .select("org_id, role")
          .eq("user_id", userId)
          .in("role", ["owner", "manager"]);
        const orgIds = (viewerMems ?? []).map((m) => m.org_id);
        if (orgIds.length === 0) {
          return {
            error: "You're not owner/manager in any org — project brief is manager-only.",
          };
        }
        const { data: targetMems } = await sb
          .from("org_members")
          .select("org_id, share_with_manager")
          .eq("user_id", target.id)
          .in("org_id", orgIds);
        if (!targetMems || targetMems.length === 0) {
          return {
            error: `${target.name ?? cleanEmail} isn't a member of any of your orgs.`,
          };
        }
        const targetMem =
          targetMems.find((m) => m.share_with_manager) ?? targetMems[0];
        if (!targetMem.share_with_manager) {
          return {
            error: `${target.name ?? cleanEmail} hasn't opted into share_with_manager — ask them to toggle it in /team. Privacy-by-default.`,
          };
        }

        const orgId = targetMem.org_id;

        // Parallel fetch — keep wall-clock small
        const [weekRes, tasksRes, projectNotesRes, agentUsageRes] =
          await Promise.all([
            getWeekEvents(target.id).catch(() => []),
            listTasks(target.id).catch(() => []),
            sb
              .from("notes")
              .select("id, content, created_at")
              .eq("user_id", target.id)
              .eq("type", "project")
              .order("created_at", { ascending: false })
              .limit(20),
            sb
              .from("chat_messages")
              .select("agent_id, created_at")
              .eq("user_id", target.id)
              .not("agent_id", "is", null)
              .gte(
                "created_at",
                new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
              ),
          ]);

        // Task bucketing
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        type TaskRow = (typeof tasksRes)[number];
        const overdue: TaskRow[] = [];
        const thisWeek: TaskRow[] = [];
        const later: TaskRow[] = [];
        for (const t of tasksRes) {
          if (!t.due) {
            later.push(t);
            continue;
          }
          const dueMs = new Date(t.due).getTime();
          if (dueMs < now) overdue.push(t);
          else if (dueMs - now <= weekMs) thisWeek.push(t);
          else later.push(t);
        }

        // AI employee usage — group chat_messages by agent_id, resolve agent names
        const usageMap = new Map<string, number>();
        for (const row of agentUsageRes.data ?? []) {
          const aid = row.agent_id as string | null;
          if (!aid) continue;
          usageMap.set(aid, (usageMap.get(aid) ?? 0) + 1);
        }
        const agentIds = Array.from(usageMap.keys());
        const { data: agents } = agentIds.length
          ? await sb
              .from("custom_agents")
              .select("id, name, emoji, slug")
              .in("id", agentIds)
          : { data: [] };
        const agentUsage = (agents ?? []).map((a) => ({
          slug: a.slug as string,
          name: a.name as string,
          emoji: (a.emoji as string | null) ?? "🤖",
          chats_14d: usageMap.get(a.id as string) ?? 0,
        }));
        agentUsage.sort((a, b) => b.chats_14d - a.chats_14d);

        // Project notes — trim each to a short snippet so LLM gets a headline
        const projects = (projectNotesRes.data ?? []).map((n) => {
          const content = (n.content as string | null) ?? "";
          const firstLine = content.split(/\r?\n/)[0] ?? "";
          return {
            snippet: firstLine.slice(0, 200),
            created_at: n.created_at as string,
          };
        });

        // Audit
        await sb.from("audit_log").insert({
          org_id: orgId,
          actor_id: userId,
          target_id: target.id,
          action: "get_member_project_brief",
          question: cleanReason,
          answer: JSON.stringify({
            overdue_count: overdue.length,
            week_count: thisWeek.length,
            project_count: projects.length,
            agents_used: agentUsage.length,
          }),
        });

        return {
          member: { name: target.name, email: target.email },
          projects,
          tasks: {
            overdue: overdue.map((t) => ({ title: t.title, due: t.due })),
            this_week: thisWeek.map((t) => ({ title: t.title, due: t.due })),
            later_total: later.length,
          },
          meetings_this_week: weekRes.length,
          ai_employees_used_14d: agentUsage,
        };
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
        let emailSendError: string | null = null;
        try {
          await sendHtmlEmail(userId, {
            to: cleanEmail,
            subject,
            html,
          });
        } catch (e) {
          emailSendError = e instanceof Error ? e.message : "Unknown error";
        }

        // If the invitee is already a Sigap user, insert an in-app
        // notification so they see it in the web app's notification bell
        // without having to click the email link first.
        let inAppNotified = false;
        const { data: existingUser } = await sb
          .from("users")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (existingUser?.id) {
          const { error: notifErr } = await sb.from("notifications").insert({
            user_id: existingUser.id,
            actor_id: userId,
            kind: "team_invite",
            title: `${inviterName} invited you to join ${orgName}`,
            body: `Click to accept the invite to ${orgName}.`,
            link: `/invite/${token}`,
          });
          if (!notifErr) inAppNotified = true;
        }

        if (emailSendError) {
          return {
            invite_created: true,
            email_sent: false,
            in_app_notified: inAppNotified,
            warning: `Invite row created${inAppNotified ? " and in-app notification delivered" : ""} but Gmail send failed: ${emailSendError}. Tell the user explicitly and share this link: ${inviteUrl}`,
            invite_url: inviteUrl,
          };
        }
        return {
          ok: true,
          email: cleanEmail,
          role: finalRole,
          sent_via: "gmail",
          in_app_notified: inAppNotified,
          note: inAppNotified
            ? "Invitee already has a Sigap account — they got both email and in-app notification."
            : "Invitee does not have a Sigap account yet — they only got the email. They'll be auto-added when they sign up via the invite link.",
        };
      },
    }),

    create_ai_employee: tool({
      description:
        "Create a new AI employee (sub-agent) for the user. Call this WHENEVER the user expresses intent to add an AI agent, AI employee, assistant, asisten, or agen — handles ALL phrasings including typos and Indonesian suffixes (buatkan, bikinin, bantuin, create, make, mau agent, butuh asisten, new AI employee, etc.). You must supply ALL required fields from the user's context. If the user hasn't given enough info (e.g. no clear role, no tasks), ASK first — don't call with placeholders. If they already packed everything in one message, call directly. You decide the tool subset based on tasks — pick from the allowed list below.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Short 1-2 word human name. Invent one if user didn't name (e.g. 'Siska', 'Budi Sales', 'HR Luna').",
          ),
        emoji: z.string().describe("ONE emoji that fits the role."),
        description: z
          .string()
          .describe(
            "One-sentence summary of what this agent does, in user's language, <120 chars.",
          ),
        role_description: z
          .string()
          .describe(
            "3-6 sentence instruction to the agent: its role, main tasks, tone, boundaries. User's language. This becomes the agent's system prompt (we'll add the hardening wrapper automatically).",
          ),
        enabled_tools: z
          .array(z.string())
          .describe(
            `Subset of allowed tool slugs relevant to the role. Pick 3-10 that match tasks. Allowed slugs: ${AGENT_ALL_TOOL_SLUGS.join(", ")}`,
          ),
      }),
      execute: async ({ name, emoji, description, role_description, enabled_tools }) => {
        const limit = await checkCreateLimits(userId);
        if (!limit.ok) return { error: limit.reason };

        const allowedSet = new Set(AGENT_ALL_TOOL_SLUGS as readonly string[]);
        const tools = (enabled_tools ?? []).filter((t) => allowedSet.has(t));
        if (tools.length === 0) {
          // Safe default for agents whose tool set wasn't specified
          tools.push("save_note", "web_search");
        }

        const sb = supabaseAdmin();
        const baseSlug = slugify(name);
        let slug = baseSlug;
        for (let i = 0; i < 5; i++) {
          const { data: existing } = await sb
            .from("custom_agents")
            .select("id")
            .eq("user_id", userId)
            .eq("slug", slug)
            .maybeSingle();
          if (!existing) break;
          slug = `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`;
        }

        const { data: created, error } = await sb
          .from("custom_agents")
          .insert({
            user_id: userId,
            slug,
            name,
            emoji: emoji || "🤖",
            description,
            system_prompt: hardenSystemPrompt(role_description),
            enabled_tools: tools,
          })
          .select("slug, name, emoji")
          .single();
        if (error || !created) {
          return { error: error?.message ?? "Failed to create AI employee" };
        }
        return {
          ok: true,
          slug: created.slug,
          name: created.name,
          emoji: created.emoji,
          tools_count: tools.length,
          link: `/agents/${created.slug}`,
          note: "AI employee created. In your reply, confirm briefly and link the user to /agents/<slug> so they can start chatting.",
        };
      },
    }),

    edit_ai_employee: tool({
      description:
        "Edit an existing AI employee's spec — name, emoji, description, role_description, or enabled_tools. Target by name OR slug (fuzzy, case-insensitive). Pass ONLY the fields being changed — omitted fields stay as-is. For 'tambahin X tool' (add a tool without removing existing), use add_tools. For 'ganti tool-nya jadi A, B, C' (replace whole list), use enabled_tools. Do NOT call list_agents first just to preserve tools — use add_tools.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Name or slug of the agent to edit. Fuzzy substring match, case-insensitive. Only call list_agents first if target is ambiguous.",
          ),
        name: z.string().nullable().optional().describe("New name (optional)"),
        emoji: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        role_description: z
          .string()
          .nullable()
          .optional()
          .describe("If provided, replaces the full role description."),
        enabled_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "REPLACES the full tool list. Only use if user explicitly wants to reset the tools. Otherwise use add_tools.",
          ),
        add_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe(
            "Tool slugs to ADD to the existing list (merged, deduplicated). Use for 'tambahin X'.",
          ),
        remove_tools: z
          .array(z.string())
          .nullable()
          .optional()
          .describe("Tool slugs to REMOVE from the existing list."),
      }),
      execute: async ({
        target,
        name,
        emoji,
        description,
        role_description,
        enabled_tools,
        add_tools,
        remove_tools,
      }) => {
        const sb = supabaseAdmin();
        const { data: all } = await sb
          .from("custom_agents")
          .select("id, slug, name, enabled_tools")
          .eq("user_id", userId);
        if (!all || all.length === 0) {
          return {
            error:
              "User has no AI employees yet. Create one first with create_ai_employee.",
          };
        }
        const lower = target.toLowerCase();
        const match = all.find(
          (a) =>
            (a.name as string).toLowerCase().includes(lower) ||
            (a.slug as string).toLowerCase().includes(lower),
        );
        if (!match) {
          return {
            error: `No AI employee matches '${target}'. Available: ${all.map((a) => a.name).join(", ")}`,
          };
        }

        const update: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (typeof name === "string" && name.trim()) update.name = name.trim();
        if (typeof emoji === "string" && emoji.trim()) update.emoji = emoji.trim();
        if (typeof description === "string") update.description = description;
        if (typeof role_description === "string" && role_description.trim()) {
          update.system_prompt = hardenSystemPrompt(role_description);
        }

        const allowedSet = new Set(AGENT_ALL_TOOL_SLUGS as readonly string[]);
        const current = new Set(
          ((match.enabled_tools as string[] | null) ?? []).filter((t) =>
            allowedSet.has(t),
          ),
        );

        // Handle tool mutations. Priority: enabled_tools (full replace),
        // then additive add/remove on top of current.
        if (Array.isArray(enabled_tools)) {
          const cleaned = enabled_tools.filter((t) => allowedSet.has(t));
          if (cleaned.length > 0) {
            // Full replace
            const next = new Set(cleaned);
            for (const t of add_tools ?? []) {
              if (allowedSet.has(t)) next.add(t);
            }
            for (const t of remove_tools ?? []) next.delete(t);
            update.enabled_tools = Array.from(next);
          }
        } else if (
          Array.isArray(add_tools) ||
          Array.isArray(remove_tools)
        ) {
          // Additive on existing
          for (const t of add_tools ?? []) {
            if (allowedSet.has(t)) current.add(t);
          }
          for (const t of remove_tools ?? []) current.delete(t);
          update.enabled_tools = Array.from(current);
        }

        const { error } = await sb
          .from("custom_agents")
          .update(update)
          .eq("id", match.id);
        if (error) return { error: error.message };

        return {
          ok: true,
          slug: match.slug,
          name: update.name ?? match.name,
          link: `/agents/${match.slug}`,
          tools_after: update.enabled_tools ?? Array.from(current),
          note: "AI employee updated. Mention what specifically changed in your reply.",
        };
      },
    }),

    list_agents: tool({
      description:
        "List the user's custom agents (sub-assistants they've built). Use when user says 'agent aku apa aja', 'list agent', 'siapa aja employee aku'. Returns each agent's name, emoji, description, and slug for linking.",
      inputSchema: z.object({}),
      execute: async () => {
        const sb = supabaseAdmin();
        const { data, error } = await sb
          .from("custom_agents")
          .select("slug, name, emoji, description, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return { count: data?.length ?? 0, agents: data ?? [] };
      },
    }),

    delete_agent: tool({
      description:
        "Delete one of the user's AI employees. Accepts name OR slug (fuzzy). Handles ALL phrasings: 'hapus agent X', 'buang Siska', 'hapusin asistennya', 'delete the hr bot', 'remove ai employee Sarah'.",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Name or slug of the AI employee to delete. Fuzzy substring match, case-insensitive.",
          ),
      }),
      execute: async ({ target }) => {
        const sb = supabaseAdmin();
        const { data: all } = await sb
          .from("custom_agents")
          .select("id, slug, name, emoji")
          .eq("user_id", userId);
        if (!all || all.length === 0) {
          return { error: "User has no AI employees to delete." };
        }
        const lower = target.toLowerCase();
        const match = all.find(
          (a) =>
            (a.name as string).toLowerCase().includes(lower) ||
            (a.slug as string).toLowerCase().includes(lower),
        );
        if (!match) {
          return {
            error: `No AI employee matches '${target}'. Available: ${all.map((a) => `${a.emoji ?? "🤖"} ${a.name}`).join(", ")}`,
          };
        }
        const { error } = await sb
          .from("custom_agents")
          .delete()
          .eq("id", match.id);
        if (error) return { error: error.message };
        return {
          ok: true,
          deleted_name: match.name,
          deleted_slug: match.slug,
          note: "AI employee + all its chat history permanently removed.",
        };
      },
    }),
  };
}
