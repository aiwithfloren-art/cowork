"use client";

import { useState } from "react";

export function EnterpriseContactForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [useCase, setUseCase] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "ok" } | { kind: "err"; msg: string }
  >({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/enterprise/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          company_website: website,
          team_size: teamSize,
          use_case: useCase,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? `Failed (${res.status})` });
      } else {
        setStatus({ kind: "ok" });
        setFullName("");
        setEmail("");
        setWebsite("");
        setTeamSize("");
        setUseCase("");
      }
    } catch (err) {
      setStatus({
        kind: "err",
        msg: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (status.kind === "ok") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-4xl">✅</div>
        <h3 className="mt-3 text-lg font-semibold text-emerald-900">
          Thanks — we got it.
        </h3>
        <p className="mt-2 text-sm text-emerald-800">
          We&apos;ll reach out within 1 business day to scope the rollout with
          you. Keep an eye on{" "}
          <span className="font-mono text-emerald-900">{email}</span>.
        </p>
        <button
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-4 text-xs font-medium text-emerald-700 hover:text-emerald-900"
        >
          Send another →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Full name
          </span>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Jane Doe"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Company email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="jane@acme.com"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
          Company website
        </span>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={submitting}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="acme.com"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
          Team size
        </span>
        <select
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
          disabled={submitting}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="">Select…</option>
          <option value="1-10">1–10</option>
          <option value="11-50">11–50</option>
          <option value="51-200">51–200</option>
          <option value="201-1000">201–1,000</option>
          <option value="1000+">1,000+</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
          How can we help?
        </span>
        <textarea
          rows={4}
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          disabled={submitting}
          maxLength={2000}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="What are you trying to solve? Tell us about your team's workflow, compliance needs, or the AI outcomes you want to enable."
        />
      </label>

      {status.kind === "err" && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {status.msg}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-500">
          We&apos;ll reply within 1 business day.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Book a call →"}
        </button>
      </div>
    </form>
  );
}
