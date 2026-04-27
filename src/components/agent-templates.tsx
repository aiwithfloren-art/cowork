"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Template = {
  emoji: string;
  // Display title shown to the user (may differ from STARTER_TEMPLATES name).
  title: string;
  // STARTER_TEMPLATES name — used by /api/agents/install-starter.
  templateName: string;
  description: string;
  // Featured templates render bigger cards at top.
  featured?: boolean;
};

// Featured agents = the V1 launch focus.
// Other agents are still installable but rendered as smaller secondary cards.
const TEMPLATES: Template[] = [
  {
    emoji: "🎯",
    title: "Lead Gen",
    templateName: "Lead Gen",
    description:
      "Cari prospect, draft cold email tone-match per niche, simpan di Google Sheet. Approve di sheet → agent kirim + update status.",
    featured: true,
  },
  {
    emoji: "🧑‍💻",
    title: "Coder",
    templateName: "Coder",
    description:
      "Build apps, landing pages, scripts. Plain-English to deployed URL. GitHub + Vercel handled.",
    featured: true,
  },
  {
    emoji: "📝",
    title: "Marketing",
    templateName: "Content Drafter",
    description:
      "Social posts, captions, email campaigns, IG/LinkedIn carousels. Auto-aligns with brand tone.",
    featured: true,
  },
  {
    emoji: "🧑‍💼",
    title: "HR Onboarding",
    templateName: "HR Onboarding",
    description: "Onboarding flow, leave tracking, employee reminders.",
  },
  {
    emoji: "📊",
    title: "Sales Follow-up",
    templateName: "Sales Follow-up",
    description: "Lead follow-up, outreach drafts, pipeline nudge.",
  },
  {
    emoji: "🔬",
    title: "Data Extractor",
    templateName: "Data Extractor",
    description: "Scrape sources, structure into tables, save to notes/sheets.",
  },
  {
    emoji: "🧐",
    title: "Code Reviewer",
    templateName: "Code Reviewer",
    description: "Daily PR/commit reviews, flag bugs, post inline comments.",
  },
  {
    emoji: "📅",
    title: "Meeting Prep",
    templateName: "Meeting Prep",
    description: "Pre-meeting research, attendee context, agenda draft.",
  },
];

export function AgentTemplates() {
  const router = useRouter();
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function install(t: Template) {
    if (installing) return;
    setInstalling(t.templateName);
    setError(null);
    try {
      const res = await fetch("/api/agents/install-starter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: t.templateName }),
      });
      const data = (await res.json()) as { ok?: boolean; slug?: string; error?: string };
      if (!res.ok || !data.slug) {
        throw new Error(data.error || "Install failed");
      }
      router.push(`/agents/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
      setInstalling(null);
    }
  }

  const featured = TEMPLATES.filter((t) => t.featured);
  const others = TEMPLATES.filter((t) => !t.featured);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-900">
          Featured AI employees
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Klik untuk activate — agent langsung siap pakai dengan tools dan
          skill yang sesuai.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}

      {/* Featured: Coder + Marketing — bigger cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {featured.map((t) => {
          const isInstalling = installing === t.templateName;
          return (
            <button
              key={t.templateName}
              onClick={() => install(t)}
              disabled={isInstalling}
              className="group rounded-xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:shadow-lg disabled:opacity-50"
            >
              <div className="flex items-start gap-3">
                <span className="text-4xl">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">
                    {t.title}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-600">
                    {t.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {isInstalling ? "Installing…" : "Click to activate"}
                </span>
                <span className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white group-hover:bg-indigo-500">
                  {isInstalling ? "…" : "+ Add"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Other templates — smaller cards */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          More templates
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {others.map((t) => {
            const isInstalling = installing === t.templateName;
            return (
              <button
                key={t.templateName}
                onClick={() => install(t)}
                disabled={isInstalling}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{t.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {t.title}
                      </p>
                      <span className="text-xs text-slate-400">
                        {isInstalling ? "…" : "+"}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                      {t.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
