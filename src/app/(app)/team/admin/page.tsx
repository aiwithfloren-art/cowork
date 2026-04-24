import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  AdminPolicyForm,
  type AdminPolicyInitial,
} from "@/components/admin-policy-form";
import {
  AdminEmployeePolicy,
  type EmployeeRow,
} from "@/components/admin-employee-policy";
import { TeamSubnav } from "@/components/team-subnav";

const ALL_TOOL_SLUGS = [
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
];

export default async function AdminPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  const { data: settings } = await sb
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.onboarded_at) redirect("/onboarding");

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id || membership.role !== "owner") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Cuma org owner yang bisa akses halaman ini. Minta owner kamu
              kalau perlu ubah policy.
            </p>
            <Link
              href="/team"
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              ← Balik ke Team
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orgId = membership.org_id;

  const { data: org } = await sb
    .from("organizations")
    .select("daily_quota_per_member, allowed_tools, require_approval_for")
    .eq("id", orgId)
    .maybeSingle();

  const initial: AdminPolicyInitial = {
    dailyQuota: (org?.daily_quota_per_member as number | null) ?? null,
    allowedTools: (org?.allowed_tools as string[] | null) ?? [],
    requireApprovalFor: (org?.require_approval_for as string[] | null) ?? [],
  };

  // Load aggregated usage for the past 7 days so the owner sees cost trend
  // without leaving the admin page.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: usage } = await sb
    .from("usage_log")
    .select("user_id, tokens_in, tokens_out, cost_usd, created_at")
    .gte("created_at", sevenDaysAgo);

  const { data: orgMembers } = await sb
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId);
  const memberIds = new Set((orgMembers ?? []).map((m) => m.user_id as string));

  const orgUsage = (usage ?? []).filter((u) =>
    memberIds.has(u.user_id as string),
  );

  const totalTokens = orgUsage.reduce(
    (a, u) => a + (u.tokens_in ?? 0) + (u.tokens_out ?? 0),
    0,
  );
  const totalCost = orgUsage.reduce(
    (a, u) => a + Number(u.cost_usd ?? 0),
    0,
  );

  // Per-employee policy rows (visibility, auto-deploy, tool whitelist).
  const { data: templates } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, visibility, auto_deploy, allowed_tools, install_count",
    )
    .eq("org_id", orgId)
    .order("published_at", { ascending: false });

  // Chat counts per template — via name→agent→chat_messages. Efficient
  // enough for current scale; if rows grow >1000, move to a materialized view.
  const tmplNames = (templates ?? []).map((t) => t.name as string);
  const { data: allAgents } = tmplNames.length
    ? await sb
        .from("custom_agents")
        .select("id, name")
        .in("user_id", Array.from(memberIds))
        .in("name", tmplNames)
    : { data: [] };
  const { data: recentChats } = (allAgents ?? []).length
    ? await sb
        .from("chat_messages")
        .select("agent_id")
        .in(
          "agent_id",
          (allAgents ?? []).map((a) => a.id as string),
        )
        .gte("created_at", sevenDaysAgo)
    : { data: [] };
  const chatsByAgentId = new Map<string, number>();
  for (const row of recentChats ?? []) {
    const aid = row.agent_id as string | null;
    if (!aid) continue;
    chatsByAgentId.set(aid, (chatsByAgentId.get(aid) ?? 0) + 1);
  }
  const chatsByTmplName = new Map<string, number>();
  for (const a of allAgents ?? []) {
    const existing = chatsByTmplName.get(a.name as string) ?? 0;
    chatsByTmplName.set(
      a.name as string,
      existing + (chatsByAgentId.get(a.id as string) ?? 0),
    );
  }

  const employeeRows: EmployeeRow[] = (templates ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    emoji: (t.emoji as string | null) ?? null,
    visibility: ((t.visibility as string | null) ?? "all") as
      | "all"
      | "manager_only"
      | "owner_only",
    auto_deploy: Boolean(t.auto_deploy),
    allowed_tools: (t.allowed_tools as string[] | null) ?? [],
    install_count: (t.install_count as number | null) ?? 0,
    chats_7d: chatsByTmplName.get(t.name as string) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin console</h1>
        <p className="mt-1 text-sm text-slate-600">
          Policy dan governance buat tim kamu. Cuma owner yang bisa akses.
        </p>
      </div>
      <TeamSubnav showAdmin={true} />

      {/* Usage snapshot */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Total members
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {memberIds.size}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Tokens (7 days)
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {totalTokens.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cost (7 days)
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              ${totalCost.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Org-wide policy</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminPolicyForm
            orgId={orgId}
            initial={initial}
            allToolSlugs={ALL_TOOL_SLUGS}
            t={{
              quotaLabel: "Pesan per member/hari",
              quotaHint:
                "Kosong = pake default platform (30/hari). Angka = cap harian per member. Set 0 kalau mau freeze usage sementara.",
              toolsLabel: "Org-wide tool whitelist",
              toolsHint:
                "Applies to ALL AI employees + tool calls. Empty = all tools allowed.",
              save: "Simpan policy",
              saving: "Menyimpan…",
              saved: "Tersimpan pada",
              failed: "Gagal simpan",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>AI Employees</CardTitle>
          <span className="text-xs text-slate-500">{employeeRows.length}</span>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-slate-500">
            Per-employee governance. Changes save automatically. Use{" "}
            <strong>Visibility</strong> to gate who can see an employee,{" "}
            <strong>Auto-deploy</strong> to pre-install on new member join,
            and <strong>Tools</strong> to restrict what each employee can
            call (overrides org-wide whitelist above).
          </p>
          <AdminEmployeePolicy
            employees={employeeRows}
            allToolSlugs={ALL_TOOL_SLUGS}
          />
        </CardContent>
      </Card>
    </div>
  );
}
