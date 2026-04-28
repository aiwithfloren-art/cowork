"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplayTutorialButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function replay() {
    setLoading(true);
    try {
      await fetch("/api/tutorial/complete", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={replay}
      disabled={loading}
      title="Replay welcome tutorial"
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 transition hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
    >
      <span>💡</span>
      <span>{loading ? "..." : "Tutorial"}</span>
    </button>
  );
}
