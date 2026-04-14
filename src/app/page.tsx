import Link from "next/link";
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { getDict, getLocale } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.landing;

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-400" />
          Cowork
        </Link>
        <div className="flex items-center gap-5 text-sm text-slate-600">
          <Link href="/manager" className="hover:text-slate-900">
            {dict.nav.manager}
          </Link>
          <Link
            href="https://github.com/aiwithfloren-art/cowork"
            target="_blank"
            className="hover:text-slate-900"
          >
            {dict.nav.github}
          </Link>
          <LanguageToggle locale={locale} />
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-indigo-700">
          {t.badge}
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          {t.heroTitle1}
          <br />
          <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
            {t.heroTitle2}
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 leading-relaxed">
          {t.heroSub}
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="mt-10"
        >
          <button
            type="submit"
            className="inline-flex items-center gap-3 rounded-xl bg-slate-900 px-6 py-3 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#fff"
                d="M21.8 10.2h-9.8v3.9h5.6c-.2 1.5-1.6 4.4-5.6 4.4a6.5 6.5 0 1 1 0-13c2 0 3.4.9 4.1 1.6l2.8-2.7C17.1 2.8 14.8 1.9 12 1.9A10 10 0 1 0 22 12a9.6 9.6 0 0 0-.2-1.8z"
              />
            </svg>
            {t.signIn}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">{t.freeNote}</p>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">{t.featuresTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{t.featuresSub}</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon="📅" title={t.f1Title} desc={t.f1Desc} />
            <FeatureCard icon="✅" title={t.f2Title} desc={t.f2Desc} />
            <FeatureCard icon="📄" title={t.f3Title} desc={t.f3Desc} />
            <FeatureCard icon="💬" title={t.f4Title} desc={t.f4Desc} />
            <FeatureCard icon="📧" title={t.f5Title} desc={t.f5Desc} />
            <FeatureCard icon="🧑‍💼" title={t.f6Title} desc={t.f6Desc} accent />
          </div>
        </div>
      </section>

      <section className="bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Manager Mode · Killer Feature
          </p>
          <h2 className="text-4xl font-bold tracking-tight text-white">
            {t.managerPitchTitle}
          </h2>
          <p className="mt-4 text-lg text-slate-300">{t.managerPitchSub}</p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <ManagerStep num="1" title={t.managerPitchStep1Title} desc={t.managerPitchStep1Desc} />
            <ManagerStep num="2" title={t.managerPitchStep2Title} desc={t.managerPitchStep2Desc} />
            <ManagerStep num="3" title={t.managerPitchStep3Title} desc={t.managerPitchStep3Desc} />
            <ManagerStep num="4" title={t.managerPitchStep4Title} desc={t.managerPitchStep4Desc} />
          </div>

          <div className="mt-12">
            <Link
              href="/manager"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
            >
              {t.managerPitchCta}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-slate-500">
          <span>
            © {new Date().getFullYear()} Cowork. {t.footerOss}.
          </span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  accent,
}: {
  icon: string;
  title: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md ${
        accent
          ? "border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

function ManagerStep({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400 text-sm font-bold text-slate-900">
        {num}
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300 leading-relaxed">{desc}</p>
    </div>
  );
}
