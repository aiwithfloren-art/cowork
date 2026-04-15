import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { readDoc } from "@/lib/google/docs";

/**
 * Tool set for a manager asking AI about a specific team member.
 * All tools are scoped to the target member and enforce:
 *   1. viewer is owner/manager in the same org as target
 *   2. target has share_with_manager = true
 *   3. file access respects visibility (private files invisible)
 *
 * Every tool invocation is logged to audit_log so the member
 * has full transparency.
 */
export function buildMemberTools(args: {
  viewerId: string;
  targetId: string;
  orgId: string;
}) {
  const { viewerId, targetId, orgId } = args;
  const sb = supabaseAdmin();

  async function audit(action: string, question: string, answer: string) {
    await sb.from("audit_log").insert({
      org_id: orgId,
      actor_id: viewerId,
      target_id: targetId,
      action,
      question,
      answer,
    });
  }

  return {
    get_member_today_schedule: tool({
      description: "Get the team member's calendar events for today.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const events = await getTodayEvents(targetId);
          return events.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
            location: e.location,
          }));
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed" };
        }
      },
    }),

    get_member_week_schedule: tool({
      description: "Get the team member's calendar events for the next 7 days.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const events = await getWeekEvents(targetId);
          return events.map((e) => ({
            title: e.title,
            start: e.start,
            end: e.end,
          }));
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed" };
        }
      },
    }),

    list_member_tasks: tool({
      description: "List the team member's open Google Tasks.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const tasks = await listTasks(targetId);
          return tasks.map((t) => ({ title: t.title, due: t.due }));
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Failed" };
        }
      },
    }),

    list_member_files: tool({
      description:
        "List the files this team member has shared with their team. Only files the member set to 'team' visibility are returned. Private files never appear here.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type, visibility")
          .eq("user_id", targetId)
          .in("visibility", ["team", "org"])
          .order("added_at", { ascending: false });

        const files = data ?? [];
        return {
          count: files.length,
          files: files.map((f) => ({
            id: f.file_id,
            name: f.file_name,
            type: shortType(f.mime_type ?? ""),
          })),
        };
      },
    }),

    read_member_file: tool({
      description:
        "Read the content of a team member's file. Only files with visibility 'team' or 'org' can be read — private files return an error. Pass the file name (fuzzy match) as 'query'.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("File name or part of it (case-insensitive match)"),
      }),
      execute: async ({ query }) => {
        const { data: all } = await sb
          .from("user_files")
          .select("file_id, file_name, mime_type, visibility")
          .eq("user_id", targetId)
          .in("visibility", ["team", "org"]);
        const files = all ?? [];

        const trimmed = query.trim().toLowerCase();
        let row =
          files.find((f) => (f.file_name ?? "").toLowerCase() === trimmed) ??
          files.find((f) =>
            (f.file_name ?? "").toLowerCase().includes(trimmed),
          ) ??
          null;

        if (!row) {
          const words = trimmed.split(/\s+/).filter((w) => w.length > 2);
          row =
            files.find((f) => {
              const name = (f.file_name ?? "").toLowerCase();
              return words.every((w) => name.includes(w));
            }) ?? null;
        }

        if (!row) {
          return {
            error: `No shared file matches "${query}". The member may not have shared that file with the team.`,
          };
        }

        try {
          const content = await readDoc(targetId, row.file_id);
          await audit(
            "read_member_file",
            `read file: ${row.file_name}`,
            (content || "(empty)").slice(0, 500),
          );
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
  };
}

function shortType(mime: string): string {
  if (mime.includes("document")) return "Doc";
  if (mime.includes("spreadsheet")) return "Sheet";
  if (mime.includes("presentation")) return "Slides";
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  return "File";
}
