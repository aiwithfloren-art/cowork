"use client";

import { useState } from "react";
import { Markdown } from "./markdown";

type Digest = {
  id: string;
  summary: string;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
};

export function AgentDigests({ initial }: { initial: Digest[] }) {
  const [digests, setDigests] = useState<Digest[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: "approved" | "dismissed") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agents/digests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        alert("Update gagal");
        setBusyId(null);
        return;
      }
      setDigests((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status } : d)),
      );
      setBusyId(null);
    } catch {
      setBusyId(null);
    }
  }

  if (digests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">
          Belum ada digest. Klik <strong>Run now ▶</strong> di atas atau
          atur schedule biar agent jalan autonomously.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Recent digests ({digests.length})
      </p>
      {digests.map((d) => (
        <div
          key={d.id}
          className={
            d.status === "pending"
              ? "rounded-xl border-l-4 border-l-indigo-500 border border-slate-200 bg-white p-4"
              : d.status === "approved"
                ? "rounded-xl border-l-4 border-l-emerald-500 border border-slate-200 bg-white p-4"
                : "rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-60"
          }
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              {new Date(d.created_at).toLocaleString()}
            </p>
            <span
              className={
                d.status === "pending"
                  ? "rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium uppercase text-indigo-700"
                  : d.status === "approved"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700"
                    : "rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600"
              }
            >
              {d.status}
            </span>
          </div>
          <div className="text-sm text-slate-800">
            <Markdown>{d.summary}</Markdown>
          </div>
          {d.status === "pending" && (
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setStatus(d.id, "dismissed")}
                disabled={busyId === d.id}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={() => setStatus(d.id, "approved")}
                disabled={busyId === d.id}
                className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Mark acted
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
