import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTodayEvents, getWeekEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { formatTime } from "@/lib/utils";
import { Chat } from "@/components/chat";
import { TasksPanel } from "@/components/tasks-panel";
import { EmptyState } from "@/components/empty-state";
import { getDict, getLocale } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TutorialModal } from "@/components/tutorial-modal";
import { DashboardInsights } from "@/components/dashboard-insights";
import { TeamSnapshot, type MemberSignal } from "@/components/team-snapshot";
import { TodayDrawer } from "@/components/today-drawer";

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

  const greetingEmoji =
    new Date().getHours() < 12 ? "☀️" : new Date().getHours() < 18 ? "🌤" : "🌙";
  const greetingHeadline = `${greeting}, ${firstName} ${greetingEmoji}`;

  // Today drawer is dead weight when both events + tasks are empty —
  // hide entirely (per audit 11a) so the chat owns the column.
  const todayHasContent = events.length > 0 || tasks.length > 0;
  const todaySummary =
    locale === "id"
      ? `Hari ini: ${events.length} jadwal · ${tasks.length} task`
      : `Today: ${events.length} events · ${tasks.length} tasks`;

  return (
    <div className="space-y-6">
      {showTutorial && <TutorialModal t={dict.tutorial} />}

      {error && (
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t.googleError}
        </div>
      )}

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
              locale === "id" ? "Digest skill pending" : "Pending skill digests",
            value: pendingDigestCount,
            tone: pendingDigestCount > 0 ? "emerald" : "default",
            href: pendingDigestCount > 0 ? "/skills" : undefined,
          },
        ]}
      />

      {/* Hero: Sigap chat is the page. The greeting + tutorial replay
          live INSIDE the chat empty-state header now (per audit 4b) so
          there's only one focal point on the column. Today drawer
          collapses above the chat ONLY when there's actual content
          (events or tasks); it disappears entirely when empty (11a).
          Chat hero is borderless (no Card chrome, per 1b) so the
          messages column reads as the page itself, not a widget. */}
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {todayHasContent && (
          <div className="order-2 lg:order-1">
            <TodayDrawer summary={todaySummary}>
              <div className="space-y-5">
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {t.todaySchedule}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {events.length} {pluralEvents(events.length, locale)}
                    </span>
                  </div>
                  {events.length === 0 ? (
                    <EmptyState icon="☕️" title={t.noEvents} />
                  ) : (
                    <ul className="space-y-2">
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
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {t.openTasks}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {tasks.length} {t.tasksCount}
                    </span>
                  </div>
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
                </section>
              </div>
            </TodayDrawer>
          </div>
        )}

        <div className="order-1 lg:order-2">
          {/* Borderless hero — chat owns the column with no card chrome.
              h-[calc(100vh-200px)] gives the chat its own breathing room.
              The chat itself ships its own subtle inner panel. */}
          <div className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col">
            <Chat
              t={dict.chat}
              initialPrompt={initialPrompt}
              resumeId={resume}
              greetingHeadline={greetingHeadline}
              greetingSub={t.greetingSub}
            />
          </div>
        </div>
      </div>

      {isManager && (
        <div className="mx-auto max-w-3xl">
          <TeamSnapshot members={teamSnapshot} locale={locale} />
        </div>
      )}
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
