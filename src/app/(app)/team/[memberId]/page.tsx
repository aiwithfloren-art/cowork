import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { formatTime } from "@/lib/utils";
import { AskMember } from "@/components/ask-member";
import { Avatar } from "@/components/avatar";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) redirect("/");

  const sb = supabaseAdmin();

  // 1. Find all org memberships of the target user
  const { data: targetMemberships } = await sb
    .from("org_members")
    .select("org_id, role, share_with_manager")
    .eq("user_id", memberId);

  // 2. Find viewer's org memberships
  const { data: viewerMemberships } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", viewerId);

  // 3. Intersect: find a shared org where viewer is owner/manager
  const viewerOrgs = new Map(
    (viewerMemberships ?? []).map((m) => [m.org_id, m.role] as const),
  );
  const sharedOrgWithAccess = (targetMemberships ?? []).find((t) => {
    const viewerRole = viewerOrgs.get(t.org_id);
    return viewerRole === "owner" || viewerRole === "manager";
  });

  // 4. Load target user profile
  const { data: targetUser } = await sb
    .from("users")
    .select("name, email, image")
    .eq("id", memberId)
    .maybeSingle();

  // Guard: target user doesn't exist
  if (!targetUser) {
    return (
      <EmptyState
        title="User not found"
        message="This user doesn't exist in Sigap."
        back
      />
    );
  }

  // Guard: viewer has no shared org where they're manager/owner
  if (!sharedOrgWithAccess) {
    return (
      <EmptyState
        title="Not authorized"
        message="You don't have manager access to this user's workspace. Ask the workspace owner to grant you the Manager role, or make sure you're in the same team."
        back
      />
    );
  }

  // Guard: member has not opted in to sharing
  if (!sharedOrgWithAccess.share_with_manager) {
    return (
      <div className="space-y-4">
        <Link
          href="/team"
          className="inline-block text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to team
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Private</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              <strong>{targetUser.name || targetUser.email}</strong> has not opted in
              to share their work data with managers. Ask them to toggle &quot;Share
              my Google work data with my manager&quot; in their Team page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All good — fetch their data
  let events: Awaited<ReturnType<typeof getTodayEvents>> = [];
  let week: Awaited<ReturnType<typeof getWeekEvents>> = [];
  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  let error: string | null = null;
  try {
    [events, week, tasks] = await Promise.all([
      getTodayEvents(memberId),
      getWeekEvents(memberId),
      listTasks(memberId),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load member data";
  }

  const overdue = tasks.filter((t) => t.due && new Date(t.due) < new Date()).length;

  return (
    <div className="space-y-6">
      <Link
        href="/team"
        className="inline-block text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to team
      </Link>

      <div className="flex items-center gap-4">
        <Avatar
          name={targetUser.name}
          email={targetUser.email}
          imageUrl={targetUser.image}
          size={48}
        />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {targetUser.name ?? targetUser.email}
          </h1>
          <p className="text-sm text-slate-600">{targetUser.email}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard icon="📅" label="Meetings today" value={events.length} />
        <StatCard icon="✅" label="Open tasks" value={tasks.length} />
        <StatCard
          icon="⚠️"
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "warn" : "ok"}
        />
        <StatCard icon="🗓" label="Events this week" value={week.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No meetings today.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs text-slate-500">
                      {formatTime(e.start)}
                    </span>
                    <span className="text-slate-900">{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">No open tasks.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.slice(0, 10).map((t) => (
                  <li key={t.id} className="text-sm text-slate-900">
                    • {t.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask AI about this member</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-500">
            Every question you ask is logged and visible to the member in their audit log.
          </p>
          <AskMember
            memberId={memberId}
            orgId={sharedOrgWithAccess.org_id}
            memberName={targetUser.name?.split(" ")[0] ?? targetUser.email.split("@")[0]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "warn";
  icon?: string;
}) {
  const color =
    tone === "warn"
      ? "text-amber-600"
      : tone === "ok"
      ? "text-emerald-600"
      : "text-slate-900";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        {icon && <span className="text-2xl leading-none">{icon}</span>}
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  message,
  back,
}: {
  title: string;
  message: string;
  back?: boolean;
}) {
  return (
    <div className="space-y-4">
      {back && (
        <Link
          href="/team"
          className="inline-block text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to team
        </Link>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
