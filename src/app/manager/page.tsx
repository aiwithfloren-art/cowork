import Link from "next/link";
import { getDict, getLocale } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";

export default async function ManagerPage() {
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.manager;

  return (
    <main className="min-h-screen bg-slate-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-400" />
          Sigap
        </Link>
        <div className="flex items-center gap-5 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-900">
            {t.backHome}
          </Link>
          <LanguageToggle locale={locale} />
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 pt-12 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
          Sigap for Teams
        </p>
        <h1 className="mt-3 text-5xl font-bold tracking-tight text-slate-900">{t.hero}</h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed">{t.heroSub}</p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {t.cta} →
        </Link>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900">{t.problemTitle}</h2>
          <ul className="mt-6 space-y-3">
            {t.problemBullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-slate-700">
                <span className="mt-1 text-red-500">✗</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-12 text-2xl font-bold text-slate-900">{t.solutionTitle}</h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{t.solutionDesc}</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="space-y-8">
          <StepBlock
            num="1"
            title={t.step1Title}
            desc={t.step1Desc}
            diagram={
              <div className="flex items-center justify-center gap-4 rounded-xl bg-slate-100 p-8 text-sm font-mono text-slate-600">
                <div className="rounded-lg bg-white px-4 py-3 shadow-sm">👤 You</div>
                <span className="text-slate-400">→</span>
                <div className="rounded-lg bg-indigo-600 px-4 py-3 text-white shadow-sm">
                  🏢 Acme Corp
                </div>
              </div>
            }
          />
          <StepBlock
            num="2"
            title={t.step2Title}
            desc={t.step2Desc}
            diagram={
              <div className="rounded-xl bg-slate-100 p-6 font-mono text-xs text-slate-700">
                <div className="mb-3 rounded border border-slate-200 bg-white p-3">
                  <div className="text-slate-400">To: budi@halolearn.com</div>
                  <div className="mt-1 font-semibold">You&apos;re invited to Acme Corp</div>
                  <div className="mt-2 inline-block rounded bg-indigo-600 px-3 py-1 text-white">
                    Accept invite
                  </div>
                </div>
                <div className="text-slate-500">📧 Sent automatically via Resend</div>
              </div>
            }
          />
          <StepBlock
            num="3"
            title={t.step3Title}
            desc={t.step3Desc}
            diagram={
              <div className="rounded-xl bg-slate-100 p-6">
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="h-4 w-4 rounded border-2 border-indigo-600 bg-indigo-600">
                    <span className="block text-xs text-white leading-none">✓</span>
                  </div>
                  <div className="text-sm text-slate-700">
                    Share my work data with my manager
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Default: OFF · Members opt-in explicitly
                </div>
              </div>
            }
          />
          <StepBlock
            num="4"
            title={t.step4Title}
            desc={t.step4Desc}
            diagram={
              <div className="rounded-xl bg-slate-100 p-6">
                <div className="mb-3 rounded-lg bg-indigo-600 p-3 text-sm text-white">
                  Manager: &quot;What is Budi working on this week?&quot;
                </div>
                <div className="rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">
                  AI: &quot;Budi has 5 open tasks, 2 client meetings, and 1 overdue item.
                  Consider offering support on the proposal draft.&quot;
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  📋 Logged in audit_log · Visible to Budi
                </div>
              </div>
            }
          />
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-3xl font-bold text-white">{t.privacyTitle}</h2>
          <ul className="mt-8 space-y-4">
            {t.privacyManifesto.map((p) => (
              <li key={p} className="flex items-start gap-3 text-slate-300">
                <span className="mt-1 text-cyan-400">✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-bold text-slate-900">{t.pricingTitle}</h2>
        <p className="mt-3 text-slate-600">{t.pricingDesc}</p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {t.cta} →
        </Link>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Sigap. Open source · MIT licensed.</span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StepBlock({
  num,
  title,
  desc,
  diagram,
}: {
  num: string;
  title: string;
  desc: string;
  diagram: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-2">
      <div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
          {num}
        </div>
        <h3 className="mt-4 text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{desc}</p>
      </div>
      <div className="flex items-center">{diagram}</div>
    </div>
  );
}
