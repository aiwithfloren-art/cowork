import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VISIBILITY_VALUES = new Set(["all", "manager_only", "owner_only"]);
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
  "github_write_files_batch",
  "github_list_commits",
  "github_get_commit_diff",
  "github_create_pr",
  "github_list_open_prs",
  "github_comment_on_pr",
  "http_request",
  "get_credential",
  "list_credentials",
  "save_credential",
  "install_skill",
  "list_installable_skills",
  "save_note",
  "assign_task_to_member",
  "broadcast_to_team",
  "list_notifications",
  "list_team_members",
  "get_member_workload",
  "get_member_project_brief",
  "create_ai_employee",
  "edit_ai_employee",
  "get_notes",
  "create_team",
  "invite_to_team",
  "start_meeting_bot",
  "get_meeting_summary",
  "list_agents",
  "delete_agent",
]);

/**
 * Update policy fields on an AI employee template — visibility, auto_deploy,
 * and allowed_tools (per-employee whitelist). Owner-only. These drive:
 *   - visibility: whether a member sees the employee in the directory
 *   - auto_deploy: whether new members auto-activate it on join
 *   - allowed_tools: tool subset the employee can call (overrides org-level)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    visibility?: string;
    auto_deploy?: boolean;
    allowed_tools?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (!tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: me } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", tmpl.org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (me?.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can edit employee policy" },
      { status: 403 },
    );
  }

  const update: Record<string, unknown> = {};

  if (body.visibility !== undefined) {
    if (!VISIBILITY_VALUES.has(body.visibility)) {
      return NextResponse.json(
        { error: "Invalid visibility value" },
        { status: 400 },
      );
    }
    update.visibility = body.visibility;
  }

  if (body.auto_deploy !== undefined) {
    update.auto_deploy = Boolean(body.auto_deploy);
  }

  if (body.allowed_tools !== undefined) {
    if (!Array.isArray(body.allowed_tools)) {
      return NextResponse.json(
        { error: "allowed_tools must be an array" },
        { status: 400 },
      );
    }
    update.allowed_tools = body.allowed_tools
      .filter((t): t is string => typeof t === "string")
      .filter((t) => ALL_TOOL_SLUGS.has(t));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error } = await sb
    .from("org_agent_templates")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
