import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { revalidatePath } from "next/cache";
import { generateLinkCode } from "@/lib/telegram/client";

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

async function generateTelegramCode() {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const sb = supabaseAdmin();
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  // Clean up any existing codes for this user
  await sb.from("telegram_link_codes").delete().eq("user_id", uid);
  await sb.from("telegram_link_codes").insert({ code, user_id: uid, expires_at: expiresAt });
  revalidatePath("/settings");
}

async function unlinkTelegram() {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const sb = supabaseAdmin();
  await sb.from("telegram_links").delete().eq("user_id", uid);
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const [{ data: settings }, { data: tgLink }, { data: pendingCode }] = await Promise.all([
    sb.from("user_settings").select("groq_key, model").eq("user_id", userId).maybeSingle(),
    sb
      .from("telegram_links")
      .select("telegram_username, linked_at")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("telegram_link_codes")
      .select("code, expires_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const maskedKey = settings?.groq_key
    ? `${settings.groq_key.slice(0, 8)}…${settings.groq_key.slice(-4)}`
    : "";

  const codeValid =
    pendingCode && new Date(pendingCode.expires_at) > new Date() ? pendingCode : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Connect Telegram</CardTitle>
        </CardHeader>
        <CardContent>
          {tgLink ? (
            <div>
              <p className="text-sm text-slate-700">
                ✅ Linked to{" "}
                <strong>
                  {tgLink.telegram_username ? `@${tgLink.telegram_username}` : "Telegram"}
                </strong>
                . You can chat with Cowork directly on Telegram.
              </p>
              <form action={unlinkTelegram} className="mt-3">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Unlink Telegram
                </button>
              </form>
            </div>
          ) : codeValid ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Your linking code:
              </p>
              <div className="flex items-center gap-4">
                <code className="rounded-lg bg-slate-900 px-4 py-2 text-2xl font-bold tracking-wider text-white">
                  {codeValid.code}
                </code>
                <span className="text-xs text-slate-500">
                  expires in 10 min
                </span>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>
                  Open{" "}
                  <a
                    href={`https://t.me/CoworkAI_floren_bot?start=${codeValid.code}`}
                    target="_blank"
                    className="text-indigo-600 underline"
                  >
                    @CoworkAI_floren_bot on Telegram
                  </a>{" "}
                  (or search the name)
                </li>
                <li>
                  Tap <strong>Start</strong>, or reply with{" "}
                  <code className="rounded bg-slate-100 px-1">/start {codeValid.code}</code>
                </li>
                <li>Done! Chat away.</li>
              </ol>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-slate-600">
                Chat with your Cowork AI from Telegram. Daily briefings and all tools work there too.
              </p>
              <form action={generateTelegramCode}>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Get linking code
                </button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

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
