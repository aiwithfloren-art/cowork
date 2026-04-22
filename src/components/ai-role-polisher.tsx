"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AI-assisted role description editor popup. Triggered next to Save/Cancel
 * when editing an agent's role. User types an instruction in Bahasa or
 * English, LLM returns a revised role, user previews and applies.
 *
 * Stays single-turn per "Polish" click — if the user wants another pass,
 * they edit the instruction and click Polish again. Keeps the UX simple
 * vs a full back-and-forth chat.
 */

const SUGGESTED_INSTRUCTIONS = [
  "Bikin tone lebih casual dan friendly",
  "Tambahin support buat LinkedIn thread",
  "Pendekin jadi 4 poin aja",
  "Bikin lebih spesifik ke automation workflow",
  "Add a rule to always include a CTA",
];

export function AiRolePolisher({
  agentName,
  currentRole,
  onApply,
  onClose,
}: {
  agentName: string;
  currentRole: string;
  onApply: (newRole: string) => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function polish() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      const res = await fetch("/api/agents/polish-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current: currentRole,
          instruction: instruction.trim(),
          agent_name: agentName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      setProposal(data.proposal as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposal) return;
    onApply(proposal);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <h3 className="font-semibold text-slate-900">
                Refine with AI
              </h3>
              <p className="text-xs text-slate-500">
                Kasih tau apa yang mau diubah — AI akan revisi role
                description untuk {agentName}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Instruction
            </span>
            <textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="e.g. tambahin support Instagram carousel, bikin tone lebih profesional, pendekin jadi 5 poin…"
              className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  polish();
                }
              }}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Cmd/Ctrl+Enter untuk trigger
            </span>
          </label>

          {!proposal && !busy && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Saran cepat
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_INSTRUCTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInstruction(s)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {busy && (
            <div className="flex items-center gap-2 rounded-md bg-indigo-50 p-3 text-sm text-indigo-800">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-500" />
              AI lagi nyusun revisi…
            </div>
          )}

          {proposal && (
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                ✓ Proposed rewrite
              </p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-emerald-200 bg-emerald-50 p-3 font-sans text-xs leading-relaxed text-slate-800">
                {proposal}
              </pre>
              <details className="group">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                  Liat versi current (compare)
                </summary>
                <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-500">
                  {currentRole || "(empty)"}
                </pre>
              </details>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            Batal
          </button>
          {proposal ? (
            <>
              <button
                onClick={() => {
                  setProposal(null);
                  inputRef.current?.focus();
                }}
                disabled={busy}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ↻ Coba lagi
              </button>
              <button
                onClick={apply}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                ✓ Apply to textarea
              </button>
            </>
          ) : (
            <button
              onClick={polish}
              disabled={busy || !instruction.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Polishing…" : "✨ Polish"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
