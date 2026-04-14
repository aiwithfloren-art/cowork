import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getDict } from "@/lib/i18n";
import { CreateOrgForm, InviteForm, PrivacyToggle } from "@/components/team-forms";

type MemberRow = {
  user_id: string;
  role: string;
  manager_id: string | null;
  share_with_manager: boolean;
};

type MemberWithUser = MemberRow & {
  user: { name: string | null; email: string; image: string | null } | null;
};

export default async function TeamPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  // Gate via onboarding
  const { data: settings } = await sb
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.onboarded_at) redirect("/onboarding");

  const dict = await getDict();
  const t = dict.team;

  // Load user's memberships
  const { data: myMemberships } = await sb
    .from("org_members")
    .select("org_id, role, share_with_manager")
    .eq("user_id", userId);

  if (!myMemberships || myMemberships.length === 0) {
    return <CreateFirstOrg t={t} />;
  }

  const primary = myMemberships[0];
  const orgId = primary.org_id;
  const role = primary.role;

  // Load org name separately
  const { data: org } = await sb
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = org?.name ?? "Team";

  // Load all members of this org
  const { data: memberRows } = await sb
    .from("org_members")
    .select("user_id, role, manager_id, share_with_manager")
    .eq("org_id", orgId);

  // Load user profiles separately to avoid embedded-join nulls
  const memberIds = memberRows?.map((m) => m.user_id) ?? [];
  const { data: profiles } = memberIds.length
    ? await sb
        .from("users")
        .select("id, name, email, image")
        .in("id", memberIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  const members: MemberWithUser[] = (memberRows ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    manager_id: m.manager_id,
    share_with_manager: m.share_with_manager,
    user: profileMap.get(m.user_id)
      ? {
          name: profileMap.get(m.user_id)!.name as string | null,
          email: profileMap.get(m.user_id)!.email as string,
          image: profileMap.get(m.user_id)!.image as string | null,
        }
      : null,
  }));

  // Pending invites
  const { data: invites } = await sb
    .from("org_invites")
    .select("email, role, accepted, created_at")
    .eq("org_id", orgId)
    .eq("accepted", false);

  const isManager = role === "owner" || role === "manager";

  return (
    <div className="space-y-6">
      <RealtimeRefresh userId={userId} orgId={orgId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{orgName}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.title}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 uppercase">
          {role}
        </span>
      </div>

      {isManager && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.teamPulse}</CardTitle>
            </CardHeader>
            <CardContent>
              <TeamPulse members={members} statLabel={t.sharingStat} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.inviteMember}</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteForm
                orgId={orgId}
                t={{
                  invitePlaceholder: t.invitePlaceholder,
                  inviteMember_role: t.inviteMember_role,
                  inviteManager_role: t.inviteManager_role,
                  inviteSend: t.inviteSend,
                }}
              />
              {invites && invites.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {t.pendingInvites}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {invites.map((i) => (
                      <li key={i.email}>{i.email}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t.members}</CardTitle>
          <span className="text-xs text-slate-500">{members.length}</span>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {m.user?.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.user.image} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {m.user?.name ?? m.user?.email ?? m.user_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.role} · {m.share_with_manager ? t.memberSharing : t.memberPrivate}
                    </p>
                  </div>
                </div>
                {isManager && m.user_id !== userId && m.share_with_manager && (
                  <Link
                    href={`/team/${m.user_id}`}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    {t.viewDetails}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.myPrivacy}</CardTitle>
        </CardHeader>
        <CardContent>
          <PrivacyToggle
            orgId={orgId}
            initialShare={primary.share_with_manager}
            label={t.privacyLabel}
            saveLabel={t.save}
          />
          <p className="mt-3 text-xs text-slate-500">{t.privacyNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamPulse({
  members,
  statLabel,
}: {
  members: MemberWithUser[];
  statLabel: string;
}) {
  const sharing = members.filter((m) => m.share_with_manager);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-700">
        <strong>{sharing.length}</strong> / {members.length} {statLabel}
      </p>
    </div>
  );
}

function CreateFirstOrg({
  t,
}: {
  t: {
    createFirst: string;
    createFirstDesc: string;
    createPlaceholder: string;
    createButton: string;
  };
}) {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t.createFirst}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">{t.createFirstDesc}</p>
          <CreateOrgForm placeholder={t.createPlaceholder} buttonLabel={t.createButton} />
        </CardContent>
      </Card>
    </div>
  );
}
