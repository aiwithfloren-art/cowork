import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTodayEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { Chat } from "@/components/chat";
import { TasksPanel } from "@/components/tasks-panel";
import { EmptyState } from "@/components/empty-state";
import { getDict, getLocale } from "@/lib/i18n";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TutorialModal } from "@/components/tutorial-modal";

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
        </div>

        <div className="lg:col-span-1">
          <Card className="flex flex-col h-[calc(100vh-180px)] lg:sticky lg:top-6">
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
