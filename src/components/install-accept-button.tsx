"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InstallAcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/install/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.push(`/agents/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={accept}
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? "Activating…" : "Activate in my workspace →"}
      </button>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
