"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export function DeleteAgentButton({
  slug,
  name,
  emoji,
}: {
  slug: string;
  name: string;
  emoji?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-400 hover:text-red-600"
      >
        Delete
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{emoji ?? "🤖"}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">
                  Hapus {name}?
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Agent ini akan dihapus permanen beserta seluruh riwayat
                  chat-nya. Aksi ini tidak bisa di-undo.
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
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
