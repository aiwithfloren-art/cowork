"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnassignButton({
  templateId,
  userId,
  templateName,
  employeeLabel,
}: {
  templateId: string;
  userId: string;
  templateName: string;
  employeeLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (
      !confirm(
        `Unassign "${templateName}" dari ${employeeLabel}?\n\nClone agent di akun mereka akan dihapus.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/template/${templateId}/assign?user_id=${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      >
        {busy ? "..." : "Unassign"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
