"use client";

import { useState } from "react";

const PRESETS: Array<{ label: string; cron: string | null }> = [
  { label: "Off (manual only)", cron: null },
  { label: "Daily at 08:30 WIB", cron: "30 1 * * *" }, // 01:30 UTC = 08:30 WIB
  { label: "Weekdays at 08:30 WIB", cron: "30 1 * * 1-5" },
  { label: "Daily at 17:00 WIB", cron: "0 10 * * *" },
  { label: "Every 4 hours", cron: "0 */4 * * *" },
];

export function AgentSchedule({
  slug,
  scheduleCron,
  objectives,
}: {
  slug: string;
  scheduleCron: string | null;
  objectives: string[];
}) {
  const [cron, setCron] = useState<string | null>(scheduleCron);
  const [objs, setObjs] = useState<string>(objectives.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const presetMatch = PRESETS.find((p) => p.cron === cron);
  const currentLabel = presetMatch
    ? presetMatch.label
    : cron
      ? `Custom (${cron})`
      : "Off";

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_cron: cron ?? null,
          objectives: objs
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      setSaved(new Date().toLocaleTimeString());
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSaving(false);
    }
  }

  async function runNow() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(slug)}/run`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      setSaved("Digest baru ada — scroll ke bawah.");
      setSaving(false);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-800">
          Autonomous schedule
        </p>
        <button
          onClick={runNow}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? "Running…" : "Run now ▶"}
        </button>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-slate-600">
          Kapan agent auto-run
        </label>
        <select
          value={cron ?? ""}
          onChange={(e) => setCron(e.target.value || null)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={p.cron ?? ""}>
              {p.label}
            </option>
          ))}
          {!presetMatch && cron && (
            <option value={cron}>Custom ({cron})</option>
          )}
        </select>
        <p className="mt-1 text-[10px] text-slate-500">
          Current: {currentLabel}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-slate-600">
          Standing objectives (satu per baris, max 10)
        </label>
        <textarea
          value={objs}
          onChange={(e) => setObjs(e.target.value)}
          rows={4}
          placeholder="Review HR emails tiap pagi&#10;Track pending onboarding&#10;Surface cuti yang belum approve"
          className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs leading-relaxed focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px]">
          {error && <span className="text-red-600">{error}</span>}
          {saved && <span className="text-emerald-600">{saved}</span>}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
      </div>
    </div>
  );
}
