"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/approvals/${approvalId}/${decision}`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(j?.error ?? `${decision} failed`);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: string;
      };
      setResult(j.result ?? (decision === "approve" ? "Approved & executed." : "Denied."));
      router.refresh();
    });
  }

  if (result) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        {result}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => decide("approve")}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "…" : "Approve & run"}
      </button>
      <button
        type="button"
        onClick={() => decide("deny")}
        disabled={pending}
        className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Deny
      </button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
