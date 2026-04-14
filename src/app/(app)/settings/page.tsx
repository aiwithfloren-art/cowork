import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { revalidatePath } from "next/cache";

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: settings } = await sb
    .from("user_settings")
    .select("groq_key, model")
    .eq("user_id", userId)
    .maybeSingle();

  async function saveKey(formData: FormData) {
    "use server";
    const session = await auth();
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (!uid) return;
    const key = (formData.get("groq_key") as string)?.trim();
    const sb = supabaseAdmin();
    if (key) {
      await sb.from("user_settings").upsert({ user_id: uid, groq_key: key });
    } else {
      await sb.from("user_settings").upsert({ user_id: uid, groq_key: null });
    }
    revalidatePath("/settings");
  }

  const maskedKey = settings?.groq_key
    ? `${settings.groq_key.slice(0, 8)}…${settings.groq_key.slice(-4)}`
    : "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Bring Your Own Groq Key</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            Cowork&apos;s free tier is rate-limited (30 messages/day). For unlimited usage, paste your
            own Groq API key below. Get one free at{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              className="text-indigo-600 underline"
            >
              console.groq.com/keys
            </a>
            .
          </p>
          <form action={saveKey} className="space-y-3">
            <input
              type="password"
              name="groq_key"
              defaultValue=""
              placeholder={maskedKey || "gsk_..."}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Save
              </button>
              {settings?.groq_key && (
                <button
                  type="submit"
                  name="groq_key"
                  value=""
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Remove key
                </button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700">
          <p>
            Signed in as <strong>{session?.user?.email}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            To revoke Cowork&apos;s access to your Google account, visit{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              className="text-indigo-600 underline"
            >
              Google Account → Security → Third-party apps
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
