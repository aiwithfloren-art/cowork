"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Path B — user's email domain matched an existing org. Give them a
 * confirm-join prompt + a "start my own team instead" escape hatch.
 */
export function OnboardingJoin({
  orgId,
  orgName,
  userEmail,
}: {
  orgId: string;
  orgName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setJoining(false);
        return;
      }
      // If auto-deployed templates exist, go to the first agent. Else dashboard.
      const deployed: string[] = data.auto_deployed ?? [];
      router.push(deployed[0] ? `/agents/${deployed[0]}` : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="inline-block rounded-full bg-indigo-50 p-4">
        <span className="text-4xl">🎉</span>
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-900">
        {orgName} is already on Cowork
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        We matched your email ({userEmail}) to an existing workspace. Join to
        start using AI employees your team has set up.
      </p>
      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        onClick={join}
        disabled={joining}
        className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {joining ? "Joining…" : `Join ${orgName} →`}
      </button>
      <p className="mt-4 text-xs text-slate-500">
        Or{" "}
        <a
          href="/onboarding?force=new"
          className="underline hover:text-slate-700"
        >
          start my own team instead
        </a>
      </p>
    </div>
  );
}
