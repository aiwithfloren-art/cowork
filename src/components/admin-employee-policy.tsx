"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type EmployeeRow = {
  id: string;
  name: string;
  emoji: string | null;
  visibility: "all" | "manager_only" | "owner_only";
  auto_deploy: boolean;
  allowed_tools: string[];
  install_count: number | null;
  chats_7d: number;
};

/**
 * Admin-only per-employee policy editor — lives on /team/admin as a
 * dedicated section. Each row can edit: visibility (dropdown), auto_deploy
 * (toggle), allowed_tools (chip multi-select in a collapsible panel).
 *
 * Saves immediately on any field change (optimistic; router.refresh() to
 * reconcile with server state).
 */
export function AdminEmployeePolicy({
  employees,
  allToolSlugs,
}: {
  employees: EmployeeRow[];
  allToolSlugs: string[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function patch(id: string, patch: Partial<EmployeeRow>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/team/skills/${encodeURIComponent(id)}/policy`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed (${res.status})`);
        setSavingId(null);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSavingId(null);
    }
  }

  if (employees.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
        No AI employees yet. Publish one from{" "}
        <code className="rounded bg-white px-1">/agents/&lt;slug&gt;</code> or
        the starter kit will seed some on org creation.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {employees.map((e) => {
        const isExpanded = expandedId === e.id;
        const isSaving = savingId === e.id;
        const whitelistCount = e.allowed_tools.length;

        return (
          <div
            key={e.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl">{e.emoji ?? "🤖"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{e.name}</p>
                <p className="text-[11px] text-slate-500">
                  {e.install_count ?? 0} activations · {e.chats_7d} chats this
                  week
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Visibility</span>
                <select
                  value={e.visibility}
                  disabled={isSaving}
                  onChange={(ev) =>
                    patch(e.id, {
                      visibility: ev.target.value as EmployeeRow["visibility"],
                    })
                  }
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                >
                  <option value="all">Everyone</option>
                  <option value="manager_only">Managers only</option>
                  <option value="owner_only">Owner only</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={e.auto_deploy}
                  disabled={isSaving}
                  onChange={(ev) =>
                    patch(e.id, { auto_deploy: ev.target.checked })
                  }
                />
                <span className="text-slate-700">🚀 Auto-deploy</span>
              </label>

              <Link
                href={`/team/admin/employees/${e.id}`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                title="View usage breakdown + activations"
              >
                📊 Audit
              </Link>

              <button
                onClick={() => setExpandedId(isExpanded ? null : e.id)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Tools ({whitelistCount === 0 ? "all" : whitelistCount})
                {isExpanded ? " ▲" : " ▼"}
              </button>
            </div>

            {isExpanded && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-xs text-slate-600">
                  Restrict which tools this employee can call. Empty = all
                  tools allowed (overrides org-level whitelist).
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allToolSlugs.map((slug) => {
                    const on = e.allowed_tools.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          const next = on
                            ? e.allowed_tools.filter((s) => s !== slug)
                            : [...e.allowed_tools, slug];
                          patch(e.id, { allowed_tools: next });
                        }}
                        className={`rounded-full px-3 py-1 font-mono text-[11px] transition ${
                          on
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {slug}
                      </button>
                    );
                  })}
                </div>
                {whitelistCount > 0 && (
                  <button
                    onClick={() => patch(e.id, { allowed_tools: [] })}
                    disabled={isSaving}
                    className="mt-3 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
                  >
                    Clear whitelist (allow all tools)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
