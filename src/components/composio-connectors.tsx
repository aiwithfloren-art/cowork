"use client";

import { useEffect, useState } from "react";

type Status = {
  enabled: string[];
  connected: string[];
};

export function ComposioConnectors() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/composio/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Status;
      setStatus(data);
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
      const res = await fetch("/api/composio/connect", {
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
  if (!status || status.enabled.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-slate-900">More integrations</h3>
        <p className="mt-1 text-xs text-slate-500">
          Powered by Composio. Connect an app to let Sigap take actions on your
          behalf.
        </p>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
        {status.enabled.map((tk) => {
          const isConnected = status.connected.includes(tk);
          return (
            <li
              key={tk}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="capitalize text-slate-900">{tk}</span>
              {isConnected ? (
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => connect(tk)}
                  disabled={busy === tk}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busy === tk ? "Opening…" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
