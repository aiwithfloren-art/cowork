"use client";

import { useState } from "react";

export function PublishAgentButton({
  slug,
  agentName,
  label,
  confirmTitle,
  confirmBody,
  successText,
  updatedText,
  errorText,
  cancelText,
  publishText,
}: {
  slug: string;
  agentName: string;
  label: string;
  confirmTitle: string;
  confirmBody: string;
  successText: string;
  updatedText: string;
  errorText: string;
  cancelText: string;
  publishText: string;
}) {
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<
    { ok: true; updated: boolean } | { ok: false; error: string } | null
  >(null);

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(slug)}/publish`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, error: data.error ?? `${errorText} (${res.status})` });
      } else {
        setResult({ ok: true, updated: Boolean(data.updated) });
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : errorText,
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setResult(null);
        }}
        className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
        title={label}
      >
        📤 {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !publishing) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {confirmTitle}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {confirmBody.replace("{name}", agentName)}
            </p>

            {result?.ok && (
              <p className="mt-3 rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">
                ✅ {result.updated ? updatedText : successText}
              </p>
            )}
            {result?.ok === false && (
              <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                {result.error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={publishing}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {result?.ok ? "Close" : cancelText}
              </button>
              {!result?.ok && (
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {publishing ? "…" : publishText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
