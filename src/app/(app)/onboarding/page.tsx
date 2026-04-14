import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDict } from "@/lib/i18n";

async function chooseIntent(formData: FormData) {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const intent = formData.get("intent") as string;
  const sb = supabaseAdmin();
  await sb.from("user_settings").upsert({
    user_id: uid,
    onboarded_at: new Date().toISOString(),
  });
  redirect(intent === "team" ? "/team" : "/dashboard");
}

export default async function OnboardingPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: settings } = await sb
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (settings?.onboarded_at) redirect("/dashboard");

  const dict = await getDict();
  const t = dict.onboarding;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">{t.title}</h1>
        <p className="mt-3 text-lg text-slate-600">{t.sub}</p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <form action={chooseIntent}>
          <input type="hidden" name="intent" value="personal" />
          <button
            type="submit"
            className="group h-full w-full rounded-2xl border-2 border-slate-200 bg-white p-8 text-left transition-all hover:border-indigo-500 hover:shadow-lg"
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
              {t.personalCta} →
            </div>
          </button>
        </form>

        <form action={chooseIntent}>
          <input type="hidden" name="intent" value="team" />
          <button
            type="submit"
            className="group h-full w-full rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-8 text-left transition-all hover:border-indigo-500 hover:shadow-lg"
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
              {t.teamCta} →
            </div>
          </button>
        </form>
      </div>

      <p className="mt-10 text-center text-xs text-slate-500">{t.bothHint}</p>
    </div>
  );
}
