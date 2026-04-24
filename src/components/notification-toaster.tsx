"use client";

import { useEffect, useRef, useState } from "react";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

type Toast = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  kind: string;
};

const POLL_INTERVAL_MS = 30_000;
const TOAST_DURATION_MS = 12_000;

/**
 * Polls /api/notifications/list at a steady interval and surfaces any
 * newly-arrived unread notifications as animated toasts in the corner
 * of the screen. Designed for long-running background work (deploy
 * watcher, future async jobs) to push status into the active tab
 * without the user asking. Works alongside Slack DM for out-of-tab
 * delivery.
 */
export function NotificationToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIds = useRef<Set<string> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/notifications/list", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { notifications: Notification[] };
        const unread = data.notifications.filter((n) => !n.read);

        // First pass: seed seen set, DO NOT toast — avoids a flood of old
        // notifications on first tab load.
        if (!initialized.current) {
          seenIds.current = new Set(unread.map((n) => n.id));
          initialized.current = true;
          return;
        }

        const seen = seenIds.current!;
        const fresh = unread.filter((n) => !seen.has(n.id));
        if (fresh.length === 0) return;

        for (const n of fresh) seen.add(n.id);

        if (cancelled) return;
        setToasts((prev) => [
          ...prev,
          ...fresh.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            kind: n.kind,
          })),
        ]);

        for (const n of fresh) {
          setTimeout(() => {
            if (cancelled) return;
            setToasts((prev) => prev.filter((t) => t.id !== n.id));
          }, TOAST_DURATION_MS);
        }
      } catch {
        // Network hiccup — try again next tick.
      }
    }

    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
      {toasts.map((t) => {
        const isSuccess = t.kind === "deploy_ready";
        const isError =
          t.kind === "deploy_failed" || t.kind === "deploy_timeout";
        const border = isSuccess
          ? "border-emerald-300 bg-emerald-50"
          : isError
            ? "border-red-300 bg-red-50"
            : "border-indigo-300 bg-indigo-50";
        const titleColor = isSuccess
          ? "text-emerald-900"
          : isError
            ? "text-red-900"
            : "text-indigo-900";

        const Wrapper = ({ children }: { children: React.ReactNode }) =>
          t.link ? (
            <a
              href={t.link}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto block"
            >
              {children}
            </a>
          ) : (
            <div className="pointer-events-auto">{children}</div>
          );

        return (
          <Wrapper key={t.id}>
            <div
              role="status"
              className={`animate-in slide-in-from-right fade-in rounded-lg border ${border} px-4 py-3 shadow-lg`}
            >
              <p className={`text-sm font-semibold ${titleColor}`}>{t.title}</p>
              {t.body && (
                <p className="mt-1 text-xs text-slate-700 line-clamp-3">{t.body}</p>
              )}
              {t.link && (
                <p className="mt-1 text-[11px] text-slate-500 underline">
                  Klik buat buka →
                </p>
              )}
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
