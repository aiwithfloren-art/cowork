import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { formatTime } from "@/lib/utils";
import { AskMember } from "@/components/ask-member";

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

  // Verify viewer is manager/owner in same org AND target shares data
  const { data: link } = await sb
    .from("org_members")
    .select("org_id, role, share_with_manager, users(name, email, image)")
    .eq("user_id", memberId);
  if (!link || link.length === 0) notFound();

  const targetRow = link[0] as unknown as {
    org_id: string;
    share_with_manager: boolean;
    users: { name: string | null; email: string; image: string | null } | null;
  };
  if (!targetRow.share_with_manager) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Private</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              This member has not opted in to share data with their manager.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: viewerMember } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", viewerId)
    .eq("org_id", targetRow.org_id)
    .maybeSingle();
  if (!viewerMember || (viewerMember.role !== "owner" && viewerMember.role !== "manager")) {
    notFound();
  }

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
      <div className="flex items-center gap-4">
        {targetRow.users?.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={targetRow.users.image} alt="" className="h-12 w-12 rounded-full" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {targetRow.users?.name ?? targetRow.users?.email}
          </h1>
          <p className="text-sm text-slate-600">{targetRow.users?.email}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Meetings today" value={events.length} />
        <StatCard label="Open tasks" value={tasks.length} />
        <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? "warn" : "ok"} />
        <StatCard label="Events this week" value={week.length} />
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
          <AskMember memberId={memberId} orgId={targetRow.org_id} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "ok" | "warn";
}) {
  const color =
    tone === "warn"
      ? "text-amber-600"
      : tone === "ok"
      ? "text-emerald-600"
      : "text-slate-900";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
