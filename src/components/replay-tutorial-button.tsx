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
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
    >
      <span>💡</span>
      <span>{loading ? "..." : "Tutorial"}</span>
    </button>
  );
}
