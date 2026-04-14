import Link from "next/link";
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-400" />
          Cowork
        </Link>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <Link href="https://github.com/aiwithfloren-art/cowork" target="_blank" className="hover:text-slate-900">
            GitHub
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
        <p className="mb-4 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-indigo-700">
          Open-source • Privacy-first • Model-agnostic
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Your AI Chief of Staff.
          <br />
          <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
            Free, open, and yours.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Sign in with Google and get an assistant that knows your calendar, tasks, and documents.
          Ask what to focus on today. Ask what&apos;s on your plate this week. Ask it to read a doc
          and summarize. All via chat.
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
              <path fill="#fff" d="M21.8 10.2h-9.8v3.9h5.6c-.2 1.5-1.6 4.4-5.6 4.4a6.5 6.5 0 1 1 0-13c2 0 3.4.9 4.1 1.6l2.8-2.7C17.1 2.8 14.8 1.9 12 1.9A10 10 0 1 0 22 12a9.6 9.6 0 0 0-.2-1.8z" />
            </svg>
            Sign in with Google
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Free during beta: 30 messages/day. Add your own Groq key in Settings for unlimited.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { t: "Daily briefing", d: "Know your meetings, top priorities, and deadlines the moment you log in." },
            { t: "Reads your docs", d: "Ask it to pull up any Google Doc by name and summarize it." },
            { t: "Manager mode", d: "Stay in sync with your team without interrupting deep work." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{f.t}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Cowork. Open source, MIT.</span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
