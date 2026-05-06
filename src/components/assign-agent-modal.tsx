"use client";

import { useEffect, useState } from "react";

type Member = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

type Props = {
  // Either an already-published template id, or a personal agent slug
  // (for the "publish-if-needed + assign" quick flow). Exactly one of
  // templateId / agentSlug should be set.
  templateId?: string;
  agentSlug?: string;
  templateName: string;
  templateEmoji: string | null;
  members: Member[];
  alreadyAssignedUserIds: string[];
  onClose: () => void;
  onAssigned: (count: number) => void;
};

export function AssignAgentModal({
  templateId,
  agentSlug,
  templateName,
  templateEmoji,
  members,
  alreadyAssignedUserIds,
  onClose,
  onAssigned,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  const assignedSet = new Set(alreadyAssignedUserIds);

  function toggle(uid: string) {
    if (assignedSet.has(uid)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    const endpoint = templateId
      ? `/api/agents/template/${templateId}/assign`
      : `/api/agents/${encodeURIComponent(agentSlug!)}/quick-assign`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: Array.from(selected),
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        results?: Array<{ status: string; error?: string }>;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      const ok =
        data.results?.filter((r) => r.status === "assigned").length ?? 0;
      const errs =
        data.results?.filter((r) => r.status === "error") ?? [];
      if (errs.length > 0) {
        setError(`${errs.length} gagal: ${errs[0]?.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
      onAssigned(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const eligible = members.filter((m) => !assignedSet.has(m.user_id));

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
          <span className="text-3xl">{templateEmoji ?? "🤖"}</span>
          <div>
            <h3 className="font-semibold text-slate-900">
              Assign &quot;{templateName}&quot;
            </h3>
            <p className="text-xs text-slate-500">
              Pilih employee yang dapet agent ini
            </p>
          </div>
        </div>

        <div className="mb-4 max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {members.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-slate-500">
              Belum ada member di tim. Invite dulu di /team.
            </p>
          )}
          {members.map((m) => {
            const already = assignedSet.has(m.user_id);
            const checked = selected.has(m.user_id);
            return (
              <label
                key={m.user_id}
                className={`flex items-center gap-3 rounded-md px-2 py-2 ${
                  already
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked || already}
                  disabled={already}
                  onChange={() => toggle(m.user_id)}
                  className="h-4 w-4 rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name ?? m.email}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                {already && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    Already assigned
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Pakai buat klien Acme — focus on B2B tone"
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠️ {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.size === 0 || eligible.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy
              ? "Assigning..."
              : `Assign to ${selected.size || ""} ${selected.size === 1 ? "employee" : "employees"}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
