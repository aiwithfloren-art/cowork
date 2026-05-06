"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Session = {
  pivot_id: string;
  title: string;
  ts: string;
};

/**
 * Left sidebar for /dashboard. Inspired by Claude.ai's chat-history
 * pane — slim 260px column with quick actions on top, then "Recents"
 * (chat sessions, click to resume), then a fixed footer slot.
 *
 * Sessions are computed server-side and passed in. A "session" is a
 * chain of user messages with no >30-min gap; we use the first
 * message id as pivot for resume, and truncate the first user prompt
 * as the visible title.
 */
export function DashboardSidebar({
  sessions,
  agentCount,
  artifactCount,
  locale,
}: {
  sessions: Session[];
  agentCount: number;
  artifactCount: number;
  locale: "en" | "id";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activePivot = searchParams.get("resume") ?? null;

  const t = {
    newChat: locale === "id" ? "+ Chat baru" : "+ New chat",
    agents: "Agents",
    artifacts: "Artifacts",
    integrations: locale === "id" ? "Integrasi" : "Integrations",
    recents: locale === "id" ? "Riwayat" : "Recents",
    noRecents:
      locale === "id"
        ? "Belum ada chat. Mulai aja di kanan."
        : "No chats yet. Start one on the right.",
    seeAll: locale === "id" ? "Lihat semua →" : "See all →",
  };

  function newChat() {
    router.push("/dashboard");
  }

  function resume(pivotId: string) {
    router.push(`/dashboard?resume=${pivotId}`);
  }

  return (
    <aside className="hidden h-[calc(100vh-72px)] w-64 flex-shrink-0 flex-col gap-4 border-r border-slate-200 bg-slate-50/60 px-3 py-4 lg:flex">
      {/* Top: New chat + quick nav */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={newChat}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-left text-sm font-medium text-white hover:bg-slate-700"
        >
          {t.newChat}
        </button>
        <NavItem href="/agents" icon="🤖" label={t.agents} badge={agentCount} />
        <NavItem
          href="/artifacts"
          icon="📋"
          label={t.artifacts}
          badge={artifactCount}
        />
        <NavItem href="/integrations" icon="🔌" label={t.integrations} />
      </div>

      {/* Recents — chat history grouped by session */}
      <div className="flex-1 overflow-hidden">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {t.recents}
        </p>
        {sessions.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-slate-400">
            {t.noRecents}
          </p>
        ) : (
          <div className="-mx-1 space-y-0.5 overflow-y-auto pr-1">
            {sessions.map((s) => {
              const isActive = activePivot === s.pivot_id;
              return (
                <button
                  key={s.pivot_id}
                  type="button"
                  onClick={() => resume(s.pivot_id)}
                  title={s.title}
                  className={`group block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] ${
                    isActive
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-slate-200 pt-3">
        <Link
          href="/history"
          className="block px-2 text-xs text-indigo-600 hover:text-indigo-700"
        >
          {t.seeAll}
        </Link>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
    >
      <span className="flex items-center gap-2">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
          {badge}
        </span>
      )}
    </Link>
  );
}
