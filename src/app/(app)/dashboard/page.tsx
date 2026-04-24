import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { Chat } from "@/components/chat";
import { TasksPanel } from "@/components/tasks-panel";
import { EmptyState } from "@/components/empty-state";
import { getDict, getLocale } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TutorialModal } from "@/components/tutorial-modal";
import { DashboardInsights } from "@/components/dashboard-insights";
import { TeamSnapshot, type MemberSignal } from "@/components/team-snapshot";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; resume?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const userId = (session.user as { id?: string }).id;
  if (!userId) redirect("/");

  const { prompt, resume } = await searchParams;
  const initialPrompt = prompt ?? "";

  const dict = await getDict();
  const t = dict.dashboard;
  const locale = await getLocale();

  const sb = supabaseAdmin();
  const { data: settings } = await sb
    .from("user_settings")
    .select("tutorial_done, onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings?.onboarded_at) redirect("/onboarding");
  const showTutorial = !settings?.tutorial_done;

  let events: Awaited<ReturnType<typeof getTodayEvents>> = [];
  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  let error: string | null = null;

  try {
    [events, tasks] = await Promise.all([getTodayEvents(userId), listTasks(userId)]);
  } catch (e) {
    error = e instanceof Error ? e.message : t.googleError;
  }

  const now = Date.now();
  const overdueTasks = tasks.filter((t) => {
    if (!t.due) return false;
    return new Date(t.due).getTime() < now;
  }).length;

  // Manager-only signals: agent digests pending + team snapshot.
  const { count: pendingDigestCountRaw } = await sb
    .from("agent_digests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");
  const pendingDigestCount = pendingDigestCountRaw ?? 0;

  // Widget counts — these drive the 4-card quick-access grid at top
  const { count: employeeCount } = await sb
    .from("custom_agents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const primaryOrgId = await (async () => {
    const { data } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return (data?.org_id as string | null) ?? null;
  })();

  const { count: skillCount } = primaryOrgId
    ? await sb
        .from("org_agent_templates")
        .select("id", { count: "exact", head: true })
        .eq("org_id", primaryOrgId)
    : { count: 0 };

  const { count: memberCount } = primaryOrgId
    ? await sb
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", primaryOrgId)
    : { count: 0 };

  const { data: myMemberships } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "manager"]);
  const managerOrgIds = (myMemberships ?? []).map((m) => m.org_id);
  const isManager = managerOrgIds.length > 0;

  let teamSnapshot: MemberSignal[] = [];
  if (isManager) {
    const { data: memberRows } = await sb
      .from("org_members")
      .select(
        "user_id, role, share_with_manager, users:user_id(id, name, email)",
      )
      .in("org_id", managerOrgIds);
    const rows = (memberRows ?? []).filter((r) => r.user_id !== userId);
    teamSnapshot = await Promise.all(
      rows.map(async (r) => {
        const u = r.users as { id?: string; name?: string; email?: string } | null;
        const signal: MemberSignal = {
          user_id: r.user_id,
          name: u?.name ?? u?.email ?? "—",
          email: u?.email ?? "",
          role: r.role as string,
          share_with_manager: Boolean(r.share_with_manager),
        };
        if (r.share_with_manager && u?.id) {
          try {
            const [dayEvents, memberTasks] = await Promise.all([
              getTodayEvents(u.id).catch(() => []),
              listTasks(u.id).catch(() => []),
            ]);
            signal.today_events = dayEvents.length;
            signal.open_tasks = memberTasks.length;
          } catch {}
        }
        return signal;
      }),
    );
    // Stable order: sharing members first (most actionable), then by name.
    teamSnapshot.sort((a, b) => {
      if (a.share_with_manager !== b.share_with_manager)
        return a.share_with_manager ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  const teamOverdueTotal = teamSnapshot.reduce(
    (sum, m) => sum + (m.open_tasks ?? 0),
    0,
  );

  const greeting = getGreeting(t);
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      {showTutorial && <TutorialModal t={dict.tutorial} />}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {greeting}, {firstName} ☀️
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t.greetingSub}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t.googleError}
        </div>
      )}

      {/* Quick-access widget grid — OpenWork-style home. Links to the main
          surfaces so users don't have to hunt through the nav. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <WidgetCard
          emoji="👥"
          label="AI Employees"
          count={employeeCount ?? 0}
          hint="Active in your workspace"
          href="/agents"
          accent="indigo"
        />
        <WidgetCard
          emoji="📚"
          label="Skill Hub"
          count={skillCount ?? 0}
          hint="Published by your team"
          href="/team/skills"
          accent="emerald"
        />
        <WidgetCard
          emoji="👤"
          label="Team"
          count={memberCount ?? 0}
          hint="Members in workspace"
          href="/team"
          accent="amber"
        />
        <WidgetCard
          emoji="⚙️"
          label="Settings"
          count={null}
          hint={isManager ? "Admin & policy" : "Your preferences"}
          href={isManager ? "/team/admin" : "/settings"}
          accent="slate"
        />
      </div>

      <DashboardInsights
        pills={[
          {
            label: locale === "id" ? "Jadwal hari ini" : "Today's events",
            value: events.length,
            tone: events.length > 0 ? "indigo" : "default",
          },
          {
            label: locale === "id" ? "Task overdue" : "Overdue tasks",
            value: overdueTasks,
            tone: overdueTasks > 0 ? "warning" : "default",
          },
          ...(isManager
            ? [
                {
                  label: locale === "id" ? "Tim — task terbuka" : "Team — open tasks",
                  value: teamOverdueTotal,
                  tone: "default" as const,
                },
              ]
            : []),
          {
            label:
              locale === "id" ? "Digest agent pending" : "Pending agent digests",
            value: pendingDigestCount,
            tone: pendingDigestCount > 0 ? "emerald" : "default",
            href: pendingDigestCount > 0 ? "/agents" : undefined,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{t.todaySchedule}</CardTitle>
              <span className="text-xs text-slate-500">
                {events.length} {pluralEvents(events.length, locale)}
              </span>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <EmptyState icon="☕️" title={t.noEvents} />
              ) : (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li
                      key={e.id}
                      className="flex gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex flex-col text-xs font-mono text-slate-500">
                        <span>{formatTime(e.start)}</span>
                        <span>{formatTime(e.end)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{e.title}</p>
                        {e.location && (
                          <p className="text-xs text-slate-500">{e.location}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{t.openTasks}</CardTitle>
              <span className="text-xs text-slate-500">
                {tasks.length} {t.tasksCount}
              </span>
            </CardHeader>
            <CardContent>
              <TasksPanel
                initialTasks={tasks}
                locale={locale}
                labels={{
                  edit: locale === "id" ? "Edit" : "Edit",
                  delete: locale === "id" ? "Hapus" : "Delete",
                  save: locale === "id" ? "Simpan" : "Save",
                  cancel: locale === "id" ? "Batal" : "Cancel",
                  empty: t.noTasks,
                }}
              />
            </CardContent>
          </Card>

          {isManager && <TeamSnapshot members={teamSnapshot} locale={locale} />}
        </div>

        <div className="lg:col-span-1">
          <Card className="flex flex-col h-[60vh] min-h-[400px] lg:h-[calc(100vh-180px)] lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>{t.chiefOfStaff}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <Chat t={dict.chat} initialPrompt={initialPrompt} resumeId={resume} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getGreeting(t: {
  greetingMorning: string;
  greetingAfternoon: string;
  greetingEvening: string;
}): string {
  const h = new Date().getHours();
  if (h < 12) return t.greetingMorning;
  if (h < 18) return t.greetingAfternoon;
  return t.greetingEvening;
}

function pluralEvents(n: number, locale: string): string {
  if (locale === "id") return n === 0 ? "jadwal" : "jadwal";
  return n === 1 ? "event" : "events";
}

function WidgetCard({
  emoji,
  label,
  count,
  hint,
  href,
  accent,
}: {
  emoji: string;
  label: string;
  count: number | null;
  hint: string;
  href: string;
  accent: "indigo" | "emerald" | "amber" | "slate";
}) {
  const accentMap: Record<typeof accent, string> = {
    indigo: "border-indigo-200 bg-indigo-50 hover:border-indigo-300 hover:bg-indigo-100",
    emerald: "border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100",
    amber: "border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100",
    slate: "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
  };
  return (
    <Link
      href={href}
      className={`flex flex-col rounded-xl border p-4 transition ${accentMap[accent]}`}
    >
      <span className="text-2xl">{emoji}</span>
      <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
      {count !== null && (
        <p className="mt-0.5 text-xs font-medium text-slate-700">
          {count} {count === 1 ? "item" : "items"}
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </Link>
  );
}
