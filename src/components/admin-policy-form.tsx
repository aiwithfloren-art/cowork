"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminPolicyInitial = {
  dailyQuota: number | null;
  allowedTools: string[];
};

export function AdminPolicyForm({
  orgId,
  initial,
  allToolSlugs,
  t,
}: {
  orgId: string;
  initial: AdminPolicyInitial;
  allToolSlugs: string[];
  t: {
    quotaLabel: string;
    quotaHint: string;
    toolsLabel: string;
    toolsHint: string;
    save: string;
    saving: string;
    saved: string;
    failed: string;
  };
}) {
  const router = useRouter();
  const [quota, setQuota] = useState<string>(
    initial.dailyQuota == null ? "" : String(initial.dailyQuota),
  );
  const [allowedTools, setAllowedTools] = useState<Set<string>>(
    new Set(initial.allowedTools),
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleTool(slug: string) {
    setAllowedTools((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const quotaNum = quota.trim() === "" ? null : Number(quota);
      const res = await fetch("/api/team/admin/update-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          daily_quota_per_member: quotaNum,
          // Empty set means "all tools allowed" — send [] to clear.
          allowed_tools: Array.from(allowedTools),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `${t.failed} (${res.status})`);
        setSaving(false);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
      setSaving(false);
    }
  }

  const restrictToolCount = allowedTools.size;

  return (
    <div className="space-y-6">
      {/* Quota */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Per-member daily quota
        </h3>
        <p className="mt-1 text-xs text-slate-500">{t.quotaHint}</p>
        <label className="mt-3 block max-w-xs">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            {t.quotaLabel}
          </span>
          <input
            type="number"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            disabled={saving}
            min={0}
            max={10000}
            placeholder="(no cap)"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </label>
      </div>

      {/* Tool whitelist */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{t.toolsLabel}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t.toolsHint}{" "}
          {restrictToolCount === 0 ? (
            <span className="font-medium text-emerald-700">
              (All tools allowed)
            </span>
          ) : (
            <span className="font-medium text-amber-700">
              ({restrictToolCount} tools whitelisted)
            </span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allToolSlugs.map((slug) => {
            const on = allowedTools.has(slug);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleTool(slug)}
                disabled={saving}
                className={`rounded-full px-3 py-1 font-mono text-[11px] transition ${
                  on
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {on ? "✓ " : ""}
                {slug}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setAllowedTools(new Set())}
          disabled={saving || allowedTools.size === 0}
          className="mt-3 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Clear whitelist (allow all tools)
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {savedAt && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          ✅ {t.saved} {savedAt}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}
