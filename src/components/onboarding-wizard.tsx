"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type StarterTemplateOption = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tools_preview: string;
};

type Step = 1 | 2 | 3 | 4;

export function OnboardingWizard({
  suggestedOrgName,
  userEmail,
  starterOptions,
}: {
  suggestedOrgName: string;
  userEmail: string;
  starterOptions: StarterTemplateOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [orgName, setOrgName] = useState(suggestedOrgName);
  const [description, setDescription] = useState("");
  const [brandTone, setBrandTone] = useState("");
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName.trim(),
          description: description.trim(),
          brand_tone: brandTone.trim(),
          // Wizard stores template name in selectedStarter (not id) because
          // templates don't exist until finalize creates the org.
          starter_template_name: selectedStarter,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      // Route to the activated agent chat if one was picked, else dashboard.
      const target = data.activated_slug
        ? `/agents/${data.activated_slug}`
        : "/dashboard";
      router.push(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  }

  const canNext =
    (step === 1 && orgName.trim().length >= 2) ||
    (step === 2 && description.trim().length >= 10) ||
    step === 3 || // connect-tools step is skippable
    (step === 4 && !!selectedStarter);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${
              n <= step ? "bg-indigo-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-indigo-600">
        Step {step} of 4
      </p>

      {step === 1 && (
        <section>
          <h1 className="text-3xl font-bold text-slate-900">
            What&apos;s the name of your team?
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            We guessed this from your email ({userEmail}). Edit if needed.
          </p>
          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Team / company name
            </span>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc."
              className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-lg focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              autoFocus
            />
          </label>
          <p className="mt-3 text-xs text-slate-500">
            You can invite teammates after setup. This name appears across your
            workspace.
          </p>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-3xl font-bold text-slate-900">
            Tell us what {orgName || "your team"} does
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your AI employees use this to stay on-brand — so a PPT or email
            they draft sounds like you, not generic AI.
          </p>
          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              1-2 sentences about the company
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="e.g. We&apos;re a B2B logistics startup serving SMEs across Southeast Asia. Priority this quarter: launch the driver app."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              autoFocus
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              {description.length} / 2000
            </span>
          </label>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Brand tone (optional, but recommended)
            </span>
            <input
              type="text"
              value={brandTone}
              onChange={(e) => setBrandTone(e.target.value)}
              maxLength={300}
              placeholder="e.g. casual but professional, confident, no jargon"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-3xl font-bold text-slate-900">
            Connect your tools
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            You can connect now or skip — come back to{" "}
            <span className="font-medium">Settings</span> anytime. Your AI
            employees will use whatever&apos;s connected.
          </p>
          <div className="mt-6 space-y-3">
            <ToolRow
              emoji="🅖"
              name="Google Workspace"
              sub="Calendar, Tasks, Gmail, Drive — already connected via sign-in"
              connected
            />
            <ToolRow
              emoji="📘"
              name="Notion"
              sub="Shared knowledge base — connect later in Settings"
              connected={false}
            />
            <ToolRow
              emoji="💬"
              name="Slack"
              sub="Team workspace messages — connect later in Settings"
              connected={false}
            />
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <h1 className="text-3xl font-bold text-slate-900">
            Pick your first AI employee
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Activate one now to get productive immediately. You can activate
            more later from the AI Employee Directory.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {starterOptions.map((opt) => {
              const selected = selectedStarter === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedStarter(opt.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{opt.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {opt.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {opt.description}
                      </p>
                      <p className="mt-2 font-mono text-[10px] text-slate-500">
                        {opt.tools_preview}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {error && (
        <p className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        {step > 1 ? (
          <button
            onClick={() => setStep((step - 1) as Step)}
            disabled={submitting}
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            ← Back
          </button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <button
            onClick={() => setStep((step + 1) as Step)}
            disabled={!canNext}
            className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Continue →
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canNext || submitting}
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Activate and go →"}
          </button>
        )}
      </div>
    </div>
  );
}

function ToolRow({
  emoji,
  name,
  sub,
  connected,
}: {
  emoji: string;
  name: string;
  sub: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-2xl">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{name}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
      {connected ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          ✓ Connected
        </span>
      ) : (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          Skip for now
        </span>
      )}
    </div>
  );
}
