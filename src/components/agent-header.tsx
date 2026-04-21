"use client";

import { useEffect, useState } from "react";

export function AgentHeader({
  name,
  emoji,
  description,
  enabledTools,
  roleDescription,
  slug,
}: {
  name: string;
  emoji: string;
  description: string;
  enabledTools: string[];
  roleDescription: string;
  slug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !clearing) setConfirmOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [confirmOpen, clearing]);

  async function clearHistory() {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chat/session?agent=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Failed (${res.status})`);
        setClearing(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setClearing(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="text-4xl">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-slate-900">{name}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmOpen(true)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                title="Clear chat history"
              >
                New thread
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                {expanded ? "Hide details ▲" : "Details ▼"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Tools ({enabledTools.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {enabledTools.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-xs text-indigo-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Role description
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              {roleDescription || "(not set)"}
            </pre>
            <p className="mt-2 text-xs text-slate-400">
              Mau ganti? Balik ke main chat dan ketik:{" "}
              <span className="font-mono text-slate-600">
                edit agent {name}: &lt;perubahan&gt;
              </span>
            </p>
          </div>
        </div>
      )}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !clearing) setConfirmOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{emoji}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">
                  Mulai thread baru dengan {name}?
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Seluruh riwayat chat dengan {name} akan dihapus. Agent
                  dan konfigurasinya tetap ada. Aksi ini tidak bisa di-undo.
                </p>
              </div>
            </div>
            {error && (
              <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={clearing}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={clearHistory}
                disabled={clearing}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {clearing ? "Menghapus…" : "Mulai thread baru"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
