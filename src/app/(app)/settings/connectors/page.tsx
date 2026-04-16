import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CONNECTORS } from "@/lib/connectors/registry";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function ConnectorsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  // Google's "connected" state comes from google_tokens (legacy)
  const { data: googleTokens } = await sb
    .from("google_tokens")
    .select("scope")
    .eq("user_id", userId)
    .maybeSingle();
  const hasGoogle = Boolean(googleTokens);

  const { data: thirdPartyConnections } = await sb
    .from("connectors")
    .select("provider, external_account_label, created_at")
    .eq("user_id", userId);

  const connectedMap = new Map<string, { label: string | null; since: string }>();
  if (hasGoogle) {
    connectedMap.set("google", {
      label: session?.user?.email ?? null,
      since: "",
    });
  }
  (thirdPartyConnections ?? []).forEach((c) => {
    connectedMap.set(c.provider, {
      label: c.external_account_label ?? null,
      since: c.created_at,
    });
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="mb-2 text-sm">
          <Link href="/settings" className="text-slate-500 hover:text-indigo-600">
            ← Settings
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Connectors</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pilih tool apa aja yang Sigap boleh akses. Tiap connector pake OAuth
          kamu sendiri — disconnect kapan pun di sini.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CONNECTORS.map((c) => {
          const connected = connectedMap.get(c.slug);
          const isConnected = Boolean(connected);
          return (
            <Card key={c.slug} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {c.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.description}
                      </p>
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      CONNECTED
                    </span>
                  ) : c.status === "coming-soon" ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      SOON
                    </span>
                  ) : null}
                </div>

                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {c.capabilities.slice(0, 3).map((cap) => (
                    <li key={cap} className="flex items-start gap-1.5">
                      <span className="text-slate-400">•</span>
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    {c.category}
                  </span>
                  {isConnected ? (
                    <span className="text-xs text-slate-500">
                      {connected?.label}
                    </span>
                  ) : c.status === "available" && c.installUrl ? (
                    <a
                      href={c.installUrl}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Connect
                    </a>
                  ) : (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-400"
                    >
                      Coming soon
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Privacy</p>
        <p className="mt-1">
          Setiap connector minta consent OAuth kamu sendiri. Sigap ga akses
          tool yang belum kamu connect. Disconnect di sini langsung revoke
          token kita (kamu juga bisa revoke dari provider-nya).
        </p>
      </div>
    </div>
  );
}
