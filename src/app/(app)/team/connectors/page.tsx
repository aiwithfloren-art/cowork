import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OrgConnectors } from "@/components/org-connectors";
import { TeamSubnav } from "@/components/team-subnav";

export default async function TeamConnectorsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  const { data: settings } = await sb
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.onboarded_at) redirect("/onboarding");

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>No team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Create a team first to connect shared tools.
            </p>
            <Link
              href="/team"
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              ← Back to Team
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canEdit =
    membership.role === "owner" || membership.role === "manager";

  const isOwner = membership.role === "owner";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Shared tools</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect once — all AI employees + members of your team inherit
          access. Personal tools (Gmail, Calendar) stay per-user.
        </p>
      </div>
      <TeamSubnav showAdmin={isOwner} />

      {/* Personal tools summary — informational */}
      <Card>
        <CardHeader>
          <CardTitle>Personal tools (per user)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Each teammate connects these from their own Google account when
            they sign in. AI employees use the right user&apos;s credentials
            automatically.
          </p>
          <ul className="mt-3 space-y-2">
            <PersonalRow emoji="📅" name="Google Calendar" />
            <PersonalRow emoji="✉️" name="Gmail" />
            <PersonalRow emoji="✅" name="Google Tasks" />
            <PersonalRow emoji="📁" name="Google Drive (picked files)" />
          </ul>
        </CardContent>
      </Card>

      {/* Org-shared tools — actionable for owner/manager */}
      <Card>
        <CardHeader>
          <CardTitle>Shared tools (org-wide)</CardTitle>
        </CardHeader>
        <CardContent>
          {!canEdit && (
            <p className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              Only owner or manager can connect shared tools. You can see
              what&apos;s connected below.
            </p>
          )}
          <OrgConnectors canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalRow({ emoji, name }: { emoji: string; name: string }) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span className="text-lg">{emoji}</span>
      <span className="flex-1 text-slate-700">{name}</span>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        ✓ Connected via sign-in
      </span>
    </li>
  );
}
