"use client";

import { useEffect, useState } from "react";

type Status = {
  enabled: string[];
  connected: string[];
};

/**
 * Org-scoped Composio connector UI — talks to /api/team/composio/*.
 * Used on /team/connectors by owner/manager to wire shared integrations
 * (Notion, Slack, Linear, etc.) that all AI employees get access to.
 *
 * Members see a read-only version elsewhere (or just the status here).
 */
export function OrgConnectors({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/composio/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as Status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function connect(toolkit: string) {
    setBusy(toolkit);
    setError(null);
    try {
      const res = await fetch("/api/team/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json()) as {
        redirectUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || "Connect failed");
      }
      window.location.href = data.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
      setBusy(null);
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>;
  if (!status || status.enabled.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        No integrations enabled on this deployment. Set{" "}
        <code className="rounded bg-white px-1">COMPOSIO_TOOLKITS</code> env
        var to expose toolkits here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
        {status.enabled.map((tk) => {
          const isConnected = status.connected.includes(tk);
          return (
            <li
              key={tk}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{toolkitEmoji(tk)}</span>
                <div>
                  <p className="font-medium capitalize text-slate-900">{tk}</p>
                  <p className="text-xs text-slate-500">
                    {toolkitTagline(tk)}
                  </p>
                </div>
              </div>
              {isConnected ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  ✓ Connected
                </span>
              ) : canEdit ? (
                <button
                  onClick={() => connect(tk)}
                  disabled={busy === tk}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busy === tk ? "Opening…" : "Connect"}
                </button>
              ) : (
                <span className="text-xs text-slate-400">Owner only</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function toolkitEmoji(tk: string): string {
  const m: Record<string, string> = {
    notion: "📘",
    linear: "📈",
    slack: "💬",
    github: "🐙",
    hubspot: "🧲",
    stripe: "💳",
    google_drive: "📁",
    airtable: "🗂️",
    discord: "🗨️",
  };
  return m[tk.toLowerCase()] ?? "🔌";
}

function toolkitTagline(tk: string): string {
  const m: Record<string, string> = {
    notion: "Shared knowledge base — pages, databases, docs",
    linear: "Issues and projects for engineering",
    slack: "Post to channels, read messages, notify team",
    github: "Repos, issues, PRs",
    hubspot: "CRM contacts, deals, pipelines",
    stripe: "Payments, invoices, customers",
    google_drive: "Team drive files and folders",
    airtable: "Shared spreadsheets and bases",
    discord: "Community server messages",
  };
  return m[tk.toLowerCase()] ?? "External service tools";
}
