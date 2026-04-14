"use client";

import { useState } from "react";

export function AskMember({ memberId, orgId }: { memberId: string; orgId: string }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || loading) return;
    setLoading(true);
    setErr(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, orgId, question: q }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data.error || "Failed");
      else setAnswer(data.answer);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What is Budi working on this week?"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>
      {answer && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm whitespace-pre-wrap">
          {answer}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
