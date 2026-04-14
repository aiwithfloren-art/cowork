"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";

type T = Dict["onboarding"];

export function OnboardingChoice({ t }: { t: T }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"personal" | "team" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(intent: "personal" | "team") {
    if (loading) return;
    setLoading(intent);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(data.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(null);
    }
  }

  return (
    <>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <button
          onClick={() => choose("personal")}
          disabled={loading !== null}
          className="group h-full w-full rounded-2xl border-2 border-slate-200 bg-white p-8 text-left transition-all hover:border-indigo-500 hover:shadow-lg disabled:opacity-60"
        >
          <div className="text-4xl">👤</div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">{t.personalTitle}</h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{t.personalDesc}</p>
          <ul className="mt-6 space-y-2">
            {t.personalBullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-indigo-500">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white group-hover:bg-indigo-600">
            {loading === "personal" ? "…" : t.personalCta + " →"}
          </div>
        </button>

        <button
          onClick={() => choose("team")}
          disabled={loading !== null}
          className="group h-full w-full rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-8 text-left transition-all hover:border-indigo-500 hover:shadow-lg disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <div className="text-4xl">🧑‍💼</div>
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              Manager Mode
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">{t.teamTitle}</h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{t.teamDesc}</p>
          <ul className="mt-6 space-y-2">
            {t.teamBullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-indigo-500">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white group-hover:bg-indigo-500">
            {loading === "team" ? "…" : t.teamCta + " →"}
          </div>
        </button>
      </div>
      {error && (
        <p className="mt-4 text-center text-xs text-red-600">{error}</p>
      )}
    </>
  );
}
