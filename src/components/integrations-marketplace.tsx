"use client";

import { useMemo, useState } from "react";
import type { ConnectorSpec } from "@/lib/connectors/registry";

type ConnectorView = ConnectorSpec & {
  connected: boolean;
  label: string | null;
};

type Props = {
  connectors: ConnectorView[];
};

export function IntegrationsMarketplace({ connectors }: Props) {
  const [query, setQuery] = useState("");
  const [pasteFor, setPasteFor] = useState<ConnectorView | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [connectors, query]);

  return (
    <div>
      <div className="mb-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari integrasi..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder-slate-400 outline-none focus:border-slate-300 focus:bg-white"
        />
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            toast.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map((c) => (
          <ConnectorCard
            key={c.slug}
            connector={c}
            onPaste={() => setPasteFor(c)}
            onDisconnected={(name) => {
              setToast({ kind: "ok", msg: `${name} disconnected.` });
              setTimeout(() => location.reload(), 600);
            }}
            onError={(msg) => setToast({ kind: "err", msg })}
          />
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            Gak ada hasil buat &quot;{query}&quot;
          </div>
        )}
      </div>

      {pasteFor && (
        <PasteTokenModal
          connector={pasteFor}
          onClose={() => setPasteFor(null)}
          onSuccess={(name) => {
            setPasteFor(null);
            setToast({ kind: "ok", msg: `${name} berhasil di-connect!` });
            setTimeout(() => location.reload(), 600);
          }}
        />
      )}
    </div>
  );
}

function ConnectorCard({
  connector,
  onPaste,
  onDisconnected,
  onError,
}: {
  connector: ConnectorView;
  onPaste: () => void;
  onDisconnected: (name: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    if (!confirm(`Disconnect ${connector.name}?`)) return;
    setBusy(true);
    try {
      // Google sub-services share a single OAuth — disconnecting one
      // means disconnecting Google entirely. Show a clearer prompt.
      if (
        connector.authType === "oauth_login" &&
        connector.category === "google"
      ) {
        if (
          !confirm(
            "Gmail, Calendar, Drive, dan Tasks pake login Google yang sama. Disconnect bakal lepas semuanya. Lanjut?",
          )
        ) {
          setBusy(false);
          return;
        }
        const res = await fetch("/api/connectors/google/disconnect", {
          method: "POST",
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(`/api/connectors/${connector.slug}/disconnect`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      onDisconnected(connector.name);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleConnect() {
    if (connector.authType === "paste_token") {
      onPaste();
      return;
    }
    if (connector.authType === "oauth_redirect" && connector.installUrl) {
      window.location.href = connector.installUrl;
      return;
    }
    if (connector.authType === "oauth_login") {
      // Google services are connected via the main sign-in flow.
      // If user is already signed in but lacks the scope, redirect
      // to /api/auth/signin to re-prompt with full scope set.
      window.location.href = "/api/auth/signin/google?callbackUrl=/integrations";
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 text-2xl">
        {connector.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{connector.name}</span>
          {connector.popularity && connector.popularity <= 5 && (
            <span className="text-xs text-slate-400">
              #{connector.popularity} popular
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {connector.description}
        </p>
        {connector.connected && connector.label && (
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {connector.label}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {connector.connected ? (
          <>
            {connector.toolsCount && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {connector.toolsCount}
              </span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={handleDisconnect}
              className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy ? "..." : "Connected"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function PasteTokenModal({
  connector,
  onClose,
  onSuccess,
}: {
  connector: ConnectorView;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guide = connector.pasteTokenGuide;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(connector.installUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || data.error) {
        setError(data.error ?? `Gagal connect (${res.status})`);
        setBusy(false);
        return;
      }
      onSuccess(connector.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-2xl">
            {connector.icon}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Connect {connector.name}
            </h3>
            <p className="text-xs text-slate-500">{connector.description}</p>
          </div>
        </div>

        {guide && (
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <p className="leading-relaxed">{guide.instructions}</p>
            <a
              href={guide.createUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
            >
              Buka {connector.name} →
            </a>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            {guide?.label ?? "Token"}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste token di sini..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-slate-400"
            autoFocus
          />
          {error && (
            <p className="mt-2 text-xs text-red-600">⚠️ {error}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
