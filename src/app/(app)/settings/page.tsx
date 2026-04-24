import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { revalidatePath } from "next/cache";
import { TelegramConnect } from "@/components/telegram-connect";
import { ConnectedFiles } from "@/components/connected-files";
import { ConnectGoogle } from "@/components/connect-google";
import { getDict } from "@/lib/i18n";

async function disconnectSlack() {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const sb = supabaseAdmin();
  await sb.from("connectors").delete().eq("user_id", uid).eq("provider", "slack");
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const [
    { data: tgLink },
    { data: pendingCode },
    { data: gtokens },
    { data: connectors },
  ] = await Promise.all([
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
    sb
      .from("google_tokens")
      .select("scope")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("connectors")
      .select("provider, external_account_label, updated_at")
      .eq("user_id", userId),
  ]);

  const slackConnector = (connectors ?? []).find((c) => c.provider === "slack");

  const scope = gtokens?.scope ?? "";
  const hasGmail = scope.includes("gmail.readonly");
  const hasGmailSend = scope.includes("gmail.send");
  const hasDriveFile = scope.includes("drive.file");

  const dict = await getDict();
  const t = dict.settings;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 md:px-6">
      <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t.googlePermissions}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectGoogle
            hasGmail={hasGmail}
            hasGmailSend={hasGmailSend}
            hasDriveFile={hasDriveFile}
          />
          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs">
            <p className="font-medium text-indigo-900">{t.connectorsNew}</p>
            <p className="mt-0.5 text-indigo-700">{t.connectorsNewDesc}</p>
            <a
              href="/settings/connectors"
              className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline"
            >
              {t.seeAllConnectors}
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.slackTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {slackConnector ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <p className="text-slate-900">
                  {t.slackConnected}{" "}
                  <strong>{slackConnector.external_account_label ?? "Slack"}</strong>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{t.slackDesc}</p>
              </div>
              <form action={disconnectSlack}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700"
                >
                  {t.slackDisconnect}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{t.slackConnectDesc}</p>
              <a
                href="/api/connectors/slack/install"
                className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                {t.slackConnect}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.connectTelegram}</CardTitle>
        </CardHeader>
        <CardContent>
          <TelegramConnect
            initialLinked={tgLink ? { username: tgLink.telegram_username } : null}
            initialCode={pendingCode ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.connectedFiles}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectedFiles />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.account}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700">
          <p>
            {t.accountSignedIn} <strong>{session?.user?.email}</strong>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {t.accountRevoke}{" "}
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
