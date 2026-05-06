import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CONNECTORS, GOOGLE_SUBSERVICES } from "@/lib/connectors/registry";
import { IntegrationsMarketplace } from "@/components/integrations-marketplace";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  // Google connection state — single OAuth covers all 4 sub-services.
  // Each sub-service is "connected" iff the underlying scope is in the
  // user's google_tokens.scope string.
  const { data: googleTokens } = await sb
    .from("google_tokens")
    .select("scope")
    .eq("user_id", userId)
    .maybeSingle();
  const googleScope = (googleTokens?.scope as string | null) ?? "";

  const googleScopeMap: Record<string, string[]> = {
    gmail: ["gmail.readonly", "gmail.send"],
    google_calendar: ["calendar.events"],
    google_drive: ["drive.file"],
    google_tasks: ["tasks"],
  };

  // Other connectors (slack, github, notion, linear) — connected iff
  // there's a row in `connectors` for that provider.
  const { data: connectorRows } = await sb
    .from("connectors")
    .select("provider, external_account_label, created_at")
    .eq("user_id", userId)
    .is("org_id", null);

  const connectorMap = new Map<
    string,
    { label: string | null; since: string }
  >();
  (connectorRows ?? []).forEach((r) => {
    connectorMap.set(r.provider, {
      label: (r.external_account_label as string | null) ?? null,
      since: (r.created_at as string | null) ?? "",
    });
  });

  const connectors = CONNECTORS.map((c) => {
    let connected = false;
    let label: string | null = null;
    if (GOOGLE_SUBSERVICES.has(c.slug)) {
      const required = googleScopeMap[c.slug] ?? [];
      connected = required.every((s) => googleScope.includes(s));
      if (connected) label = session?.user?.email ?? null;
    } else {
      const row = connectorMap.get(c.slug);
      connected = Boolean(row);
      label = row?.label ?? null;
    }
    return { ...c, connected, label };
  }).sort((a, b) => (a.popularity ?? 99) - (b.popularity ?? 99));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect tools yang kamu pakai sehari-hari. Sigap pake credential
          kamu sendiri — disconnect kapan aja.
        </p>
      </div>
      <IntegrationsMarketplace connectors={connectors} />
    </div>
  );
}
