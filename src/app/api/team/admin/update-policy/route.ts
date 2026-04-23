import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPPORTED_PROVIDERS, type LLMProvider } from "@/lib/llm/providers";

export const runtime = "nodejs";

/**
 * Org-level admin policy update — LLM provider/model/API key, per-member
 * quota, and allowed-tool whitelist. Owner-only.
 *
 * Members on the org inherit these settings automatically via getLLMForUser.
 * Leaving llm_api_key empty means "use the platform's env key" (SaaS
 * default), which for most orgs on the current Groq tier is fine.
 */

const ALL_TOOL_SLUGS = new Set([
  "get_today_schedule",
  "get_week_schedule",
  "find_meeting_slots",
  "add_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "list_tasks",
  "add_task",
  "complete_task",
  "update_task",
  "delete_task",
  "list_connected_files",
  "read_connected_file",
  "share_drive_file",
  "list_recent_emails",
  "read_email",
  "send_email",
  "web_search",
  "generate_image",
  "generate_carousel_html",
  "create_artifact",
  "create_google_doc",
  "github_list_repos",
  "github_create_repo",
  "github_read_file",
  "github_write_file",
  "github_list_commits",
  "github_get_commit_diff",
  "github_create_pr",
  "github_list_open_prs",
  "github_comment_on_pr",
  "save_note",
  "assign_task_to_member",
  "broadcast_to_team",
  "list_notifications",
  "list_team_members",
  "get_member_workload",
  "get_notes",
  "create_team",
  "invite_to_team",
  "start_meeting_bot",
  "get_meeting_summary",
  "list_agents",
  "delete_agent",
]);

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    org_id: string;
    llm_provider?: string | null;
    llm_model?: string | null;
    llm_api_key?: string | null;
    daily_quota_per_member?: number | null;
    allowed_tools?: string[] | null;
    require_approval_for?: string[] | null;
  };
  if (!body.org_id) {
    return NextResponse.json({ error: "org_id required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: me } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", body.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (me?.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can update admin policy" },
      { status: 403 },
    );
  }

  // Field-by-field sanitization. Each field is optional — "undefined"
  // means "don't touch", "null" means "clear".
  const update: Record<string, unknown> = {};

  if (body.llm_provider !== undefined) {
    if (
      body.llm_provider !== null &&
      !SUPPORTED_PROVIDERS.includes(body.llm_provider as LLMProvider)
    ) {
      return NextResponse.json(
        {
          error: `llm_provider must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    update.llm_provider = body.llm_provider;
  }

  if (body.llm_model !== undefined) {
    update.llm_model =
      typeof body.llm_model === "string" && body.llm_model.trim()
        ? body.llm_model.trim().slice(0, 200)
        : null;
  }

  if (body.llm_api_key !== undefined) {
    update.llm_api_key =
      typeof body.llm_api_key === "string" && body.llm_api_key.trim()
        ? body.llm_api_key.trim()
        : null;
  }

  if (body.daily_quota_per_member !== undefined) {
    if (body.daily_quota_per_member === null) {
      update.daily_quota_per_member = null;
    } else {
      const n = Number(body.daily_quota_per_member);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        return NextResponse.json(
          { error: "daily_quota_per_member must be 0-10000 or null" },
          { status: 400 },
        );
      }
      update.daily_quota_per_member = Math.floor(n);
    }
  }

  if (body.allowed_tools !== undefined) {
    if (body.allowed_tools === null) {
      update.allowed_tools = [];
    } else if (Array.isArray(body.allowed_tools)) {
      update.allowed_tools = body.allowed_tools
        .filter((t): t is string => typeof t === "string")
        .filter((t) => ALL_TOOL_SLUGS.has(t));
    }
  }

  if (body.require_approval_for !== undefined) {
    if (body.require_approval_for === null) {
      update.require_approval_for = [];
    } else if (Array.isArray(body.require_approval_for)) {
      // Only allow gating tools that we actually wrapped with checkApproval.
      // Gating an unwrapped tool is silently ignored — the UI only exposes
      // the wrapped ones anyway.
      const GATABLE = new Set([
        "send_email",
        "broadcast_to_team",
        "assign_task_to_member",
      ]);
      update.require_approval_for = body.require_approval_for
        .filter((t): t is string => typeof t === "string")
        .filter((t) => GATABLE.has(t));
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error } = await sb
    .from("organizations")
    .update(update)
    .eq("id", body.org_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
