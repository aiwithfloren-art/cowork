import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTodayEvents } from "@/lib/google/calendar";
import { listTasks } from "@/lib/google/tasks";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";
import { Chat } from "@/components/chat";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const userId = (session.user as { id?: string }).id;
  if (!userId) redirect("/");

  let events: Awaited<ReturnType<typeof getTodayEvents>> = [];
  let tasks: Awaited<ReturnType<typeof listTasks>> = [];
  let error: string | null = null;

  try {
    [events, tasks] = await Promise.all([getTodayEvents(userId), listTasks(userId)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load Google data";
  }

  const greeting = getGreeting();
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {greeting}, {firstName} ☀️
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Here&apos;s what your day looks like.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Couldn&apos;t load Google data: {error}. Try signing out and back in.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Today&apos;s Schedule</CardTitle>
              <span className="text-xs text-slate-500">{events.length} events</span>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No events today. Enjoy the space.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-col text-xs font-mono text-slate-500">
                        <span>{formatTime(e.start)}</span>
                        <span>{formatTime(e.end)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{e.title}</p>
                        {e.location && <p className="text-xs text-slate-500">{e.location}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Open Tasks</CardTitle>
              <span className="text-xs text-slate-500">{tasks.length} open</span>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No open tasks. You&apos;re clear.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
                      <span className="flex-1 text-sm text-slate-900">{t.title}</span>
                      {t.due && (
                        <span className="text-xs text-slate-500">
                          {new Date(t.due).toLocaleDateString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="h-[620px] flex flex-col">
            <CardHeader>
              <CardTitle>Chief of Staff</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <Chat />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
