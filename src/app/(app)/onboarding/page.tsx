import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDict } from "@/lib/i18n";
import { OnboardingChoice } from "@/components/onboarding-choice";

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

      <OnboardingChoice t={t} />

      <p className="mt-10 text-center text-xs text-slate-500">{t.bothHint}</p>
    </div>
  );
}
