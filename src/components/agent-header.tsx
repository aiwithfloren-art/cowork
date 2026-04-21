"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [clearing, setClearing] = useState(false);
  const router = useRouter();

  async function clearHistory() {
    if (!confirm(`Bersihkan semua history chat dengan ${name}? Tidak bisa di-undo.`))
      return;
    setClearing(true);
    try {
      const res = await fetch(
        `/api/chat/session?agent=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal: ${err.error ?? res.status}`);
        setClearing(false);
        return;
      }
      // Force reload so Chat component re-fetches (now empty) session.
      window.location.reload();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "unknown"}`);
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
                onClick={clearHistory}
                disabled={clearing}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                title="Clear chat history"
              >
                {clearing ? "Clearing…" : "New thread"}
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
    </div>
  );
}
