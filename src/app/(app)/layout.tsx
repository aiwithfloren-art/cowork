import Link from "next/link";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getDict, getLocale } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const dict = await getDict();
  const locale = await getLocale();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-indigo-600 to-cyan-400" />
            Sigap
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-slate-700 hover:text-slate-900">
              {dict.nav.dashboard}
            </Link>
            <Link href="/team" className="text-slate-700 hover:text-slate-900">
              {dict.nav.team}
            </Link>
            <Link href="/history" className="text-slate-700 hover:text-slate-900">
              {dict.nav.history}
            </Link>
            <Link href="/audit" className="text-slate-700 hover:text-slate-900">
              {dict.nav.audit}
            </Link>
            <Link href="/settings" className="text-slate-700 hover:text-slate-900">
              {dict.nav.settings}
            </Link>
            <LanguageToggle locale={locale} />
            <div className="flex items-center gap-3 border-l border-slate-200 pl-6">
              {session.user.image && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={session.user.image}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              )}
              <span className="text-slate-600 text-xs">{session.user.name}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-xs text-slate-500 hover:text-slate-900">
                  {dict.nav.signOut}
                </button>
              </form>
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
