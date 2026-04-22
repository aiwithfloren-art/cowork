import Link from "next/link";
import type { Metadata } from "next";
import { signIn } from "@/auth";
import { EnterpriseContactForm } from "@/components/enterprise-contact-form";

export const metadata: Metadata = {
  title: "Cowork Enterprise — AI Chief of Staff for your organization",
  description:
    "Shared AI skills, policy-governed agents, and Google Workspace-native workflows for your team. Managed cloud — no LLM keys, no infra, just turn it on.",
};

// Server action — shared by every "Start free" button on the page.
async function startFree() {
  "use server";
  await signIn("google", { redirectTo: "/onboarding" });
}

export default function EnterprisePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-400" />
            <span>Cowork</span>
            <span className="ml-1 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              Enterprise
            </span>
          </Link>
          <div className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/" className="hover:text-slate-900">
              Product
            </Link>
            <a href="#pillars" className="hidden hover:text-slate-900 sm:inline">
              Features
            </a>
            <form action={startFree}>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Start free →
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white" />
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-block rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wider text-indigo-700">
              Cowork Enterprise
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              The AI Chief of Staff
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                for your whole organization
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              Shared AI skills, policy-governed agents, and Google
              Workspace-native workflows. Managed cloud — no LLM keys to
              provision, no infra to run, just invite your team and go.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <form action={startFree}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#fff"
                      d="M21.8 10.2h-9.8v3.9h5.6c-.2 1.5-1.6 4.4-5.6 4.4a6.5 6.5 0 1 1 0-13c2 0 3.4.9 4.1 1.6l2.8-2.7C17.1 2.8 14.8 1.9 12 1.9A10 10 0 1 0 22 12a9.6 9.6 0 0 0-.2-1.8z"
                    />
                  </svg>
                  Start free with Google →
                </button>
              </form>
              <a
                href="#contact"
                className="rounded-xl bg-slate-900 px-6 py-3 text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700"
              >
                Book a call
              </a>
              <a
                href="#pillars"
                className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Your workspace, your team, your AI employees — ready in 2 minutes.
              No credit card, no setup wizard longer than lunch.
            </p>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>✓ Managed cloud — zero infra setup</span>
              <span>✓ LLM included — no API keys to manage</span>
              <span>✓ Google Workspace native</span>
              <span>✓ Role-based access + full audit trail</span>
            </p>
          </div>
        </div>
      </section>

      {/* Demo showcase */}
      <section className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Hire AI employees, not just chatbots
            </p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
              One workspace, many AI employees, shared across your team
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Owner defines the AI employees. Team activates them. Everyone
              @mentions them in chat. Governance, audit, and company context
              flow automatically.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-5">
            {/* Mock AI Employee Directory */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Acme · AI Employee Directory
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    5 active
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      emoji: "👩‍🎨",
                      name: "Amore",
                      role: "Content Creator",
                      tools: "notion · generate_image · web_search",
                      active: true,
                    },
                    {
                      emoji: "🤝",
                      name: "Budi",
                      role: "Sales Follow-up",
                      tools: "gmail · hubspot · calendar",
                      active: true,
                    },
                    {
                      emoji: "📊",
                      name: "Ron",
                      role: "Weekly Analyst",
                      tools: "sheets · notion · linear",
                      active: true,
                    },
                    {
                      emoji: "👥",
                      name: "Dina",
                      role: "HR Onboarding",
                      tools: "tasks · gmail · calendar",
                      active: false,
                    },
                  ].map((e) => (
                    <div
                      key={e.name}
                      className={`rounded-xl border p-3 transition ${
                        e.active
                          ? "border-indigo-200 bg-indigo-50/50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{e.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            @{e.name.toLowerCase()}
                          </p>
                          <p className="text-xs text-slate-600">{e.role}</p>
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-500">
                            {e.tools}
                          </p>
                        </div>
                        {e.active && (
                          <span className="text-[10px] font-medium text-emerald-700">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    In main chat
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-700">
                    <span className="rounded bg-indigo-100 px-1 text-indigo-700">
                      @amore
                    </span>{" "}
                    bikin 3 caption IG launch driver app
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Routes to Amore → uses Acme&apos;s brand tone, Notion
                    context, your Gmail for drafts
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center">
                <p className="text-sm font-medium text-indigo-900">
                  Build your own AI employees in minutes
                </p>
                <form action={startFree} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
                  >
                    Start free with Google →
                  </button>
                </form>
              </div>
            </div>

            {/* Governance rail */}
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  <h3 className="font-semibold text-slate-900">
                    Every step governed
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Admins whitelist which tools the AI can call. Want to
                  block delegation? Remove{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                    assign_task_to_member
                  </code>{" "}
                  from the whitelist and the AI politely refuses it.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📚</span>
                  <h3 className="font-semibold text-slate-900">
                    On-brand by default
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Every deliverable gets your company context injected —
                  brand tone, websites, product description. No generic
                  AI slop, no re-pasting context every time.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔒</span>
                  <h3 className="font-semibold text-slate-900">
                    Audit-ready by default
                  </h3>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Every agent action logs who asked, what ran, which tool
                  was called. Export the log as JSON anytime. Members see
                  every query about them — consent, not surveillance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Enterprise building blocks
            </p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
              Everything the Personal tier has —
              <br />
              plus governance for the whole org
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Pillar
              emoji="📚"
              title="Skill Hub"
              body="Owners publish any agent as a reusable skill. Teammates install with one click — pre-configured tools, objectives, and role description ready to go."
              bullet={[
                "Per-org skill catalog",
                "Install count + publisher visibility",
                "Fork semantics (installs persist through unpublish)",
              ]}
            />
            <Pillar
              emoji="⚙️"
              title="Admin Console"
              body="Owner-only policy dashboard. Cap daily usage per member, whitelist which AI tools can be used, and watch cost + token trends across the team."
              bullet={[
                "Per-member daily quota enforcement",
                "Tool allowlist at runtime",
                "7-day usage + cost snapshot",
                "Role-based access (owner / manager / member)",
              ]}
            />
            <Pillar
              emoji="🧾"
              title="Full audit trail"
              body="Every AI action — who asked, what ran, which tool was called, what the response was — is logged. Members can see every query about them. Exports as JSON."
              bullet={[
                "Per-turn chat + tool call history",
                "Audit log export (SIEM-ready)",
                "Member-visible queries for transparency",
              ]}
            />
            <Pillar
              emoji="🏢"
              title="Company context"
              body="Brand tone, description, websites saved per-org. Injected into every deliverable the AI produces — PPTs, proposals, client emails — so nothing comes out generic."
              bullet={[
                "Just-in-time Q&A when thin",
                "Owner/manager-gated edits",
                "Flows to every sub-agent",
              ]}
            />
            <Pillar
              emoji="👥"
              title="Manager Mode"
              body="Privacy-respecting team visibility. Members toggle data sharing per-person. Every manager query about a member is logged — full transparency, both ways."
              bullet={[
                "Opt-in per member, not per-org",
                "Audit log visible to the member queried",
                "Workload view without surveillance",
              ]}
            />
            <Pillar
              emoji="🔌"
              title="Google Workspace native"
              body="Not just &quot;MCPs&quot; — deep, typed integration with Calendar, Tasks, Gmail, Drive. Scheduled digests. Meeting bot that auto-extracts action items."
              bullet={[
                "Read + write across 4 Google APIs",
                "Attendee.dev meeting transcription",
                "Autonomous daily digests per agent",
              ]}
            />
          </div>
        </div>
      </section>

      {/* How it runs */}
      <section id="deployment" className="border-t border-slate-200 bg-slate-900 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Zero infra, zero LLM setup
            </p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
              Turn it on, invite the team, ship
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Cowork Enterprise runs on our managed cloud. We handle the
              infrastructure, model hosting, and updates — your team just
              signs in with Google and gets to work.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "☁️",
                title: "Managed cloud",
                body: "Infra hosted on Vercel + Supabase. Enterprise-grade SLA. Your org spins up in minutes — no VMs to rent, no Kubernetes to babysit.",
              },
              {
                icon: "🧠",
                title: "LLM included",
                body: "No API keys to provision. We run the model layer — you focus on outcomes, not rate limits or provider dashboards.",
              },
              {
                icon: "🔄",
                title: "Auto-updates",
                body: "New skills, integrations, and compliance controls ship automatically. No engineering team required on your side.",
              },
            ].map(({ icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-700 bg-slate-800 p-6"
              >
                <span className="text-2xl">{icon}</span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-slate-300">{body}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-xs text-slate-400">
            Need data residency, on-prem inference, or a private VPC deploy?{" "}
            <a href="#contact" className="font-medium text-cyan-400 hover:text-cyan-300">
              Let&apos;s talk →
            </a>
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Get in touch
            </p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
              Tell us what you need
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Share your team context — we&apos;ll scope the rollout and get
              back to you over email within 1 business day.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <EnterpriseContactForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-600 to-cyan-400" />
              <span className="font-semibold text-slate-900">Cowork</span>
              <span>·</span>
              <span>AI Chief of Staff for your team</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-900">
                Product
              </Link>
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-slate-900">
                Terms
              </Link>
              <Link
                href="https://github.com/aiwithfloren-art/cowork"
                target="_blank"
                className="hover:text-slate-900"
              >
                GitHub
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Pillar({
  emoji,
  title,
  body,
  bullet,
}: {
  emoji: string;
  title: string;
  body: string;
  bullet: string[];
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm">
      <span className="text-3xl">{emoji}</span>
      <h3 className="mt-3 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
      <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
        {bullet.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span className="text-emerald-500">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
