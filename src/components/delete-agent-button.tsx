"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAgentButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Hapus agent "${name}"? Tidak bisa di-undo.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Gagal: ${err.error ?? res.status}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "unknown"}`);
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
