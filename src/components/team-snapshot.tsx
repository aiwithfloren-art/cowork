import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export type MemberSignal = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  share_with_manager: boolean;
  today_events?: number;
  open_tasks?: number;
};

export function TeamSnapshot({
  members,
  locale,
}: {
  members: MemberSignal[];
  locale: "en" | "id";
}) {
  if (members.length === 0) return null;

  const heading = locale === "id" ? "Tim kamu" : "Your team";
  const sub =
    locale === "id"
      ? "Snapshot workload anggota yang sudah share-with-manager."
      : "Workload snapshot for members sharing with manager.";

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <CardTitle>{heading}</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
        </div>
        <Link
          href="/team"
          className="text-xs text-indigo-600 hover:text-indigo-500"
        >
          {locale === "id" ? "Kelola →" : "Manage →"}
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <Link
                href={`/team/${m.user_id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-slate-900 hover:text-indigo-700"
              >
                <span className="truncate font-medium">{m.name || m.email}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                  {m.role}
                </span>
              </Link>
              {m.share_with_manager ? (
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span title="meetings today">
                    📅 {m.today_events ?? "—"}
                  </span>
                  <span title="open tasks">
                    ✅ {m.open_tasks ?? "—"}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400">
                  {locale === "id" ? "private" : "private"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
