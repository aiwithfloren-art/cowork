import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { headers } from "next/headers";
import { sendInviteEmail } from "@/lib/email/client";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { getDict } from "@/lib/i18n";

type Member = {
  user_id: string;
  role: string;
  manager_id: string | null;
  share_with_manager: boolean;
  users: { name: string | null; email: string; image: string | null } | null;
};

async function createOrg(formData: FormData) {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const name = (formData.get("name") as string).trim();
  if (!name) return;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + crypto.randomBytes(3).toString("hex");

  const sb = supabaseAdmin();
  const { data: org } = await sb
    .from("organizations")
    .insert({ name, slug, owner_id: uid })
    .select("id")
    .single();

  if (org) {
    await sb
      .from("org_members")
      .insert({ org_id: org.id, user_id: uid, role: "owner", share_with_manager: true });
  }
  revalidatePath("/team");
}

async function inviteMember(formData: FormData) {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const email = (formData.get("email") as string).trim().toLowerCase();
  const orgId = formData.get("org_id") as string;
  const role = (formData.get("role") as string) || "member";
  if (!email || !orgId) return;

  const token = crypto.randomBytes(24).toString("hex");
  const sb = supabaseAdmin();
  await sb.from("org_invites").insert({
    org_id: orgId,
    email,
    role,
    manager_id: role === "member" ? uid : null,
    token,
  });

  // Lookup inviter name + org name, then send email
  const [{ data: inviter }, { data: org }] = await Promise.all([
    sb.from("users").select("name, email").eq("id", uid).maybeSingle(),
    sb.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  const h = await headers();
  const host = h.get("host") ?? "cowork-gilt.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${proto}://${host}/invite/${token}`;
  await sendInviteEmail({
    to: email,
    inviterName: inviter?.name || inviter?.email || "Someone",
    orgName: org?.name || "a team",
    inviteUrl,
  });

  revalidatePath("/team");
}

async function togglePrivacy(formData: FormData) {
  "use server";
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return;
  const orgId = formData.get("org_id") as string;
  const share = formData.get("share") === "on";
  const sb = supabaseAdmin();
  await sb
    .from("org_members")
    .update({ share_with_manager: share })
    .eq("org_id", orgId)
    .eq("user_id", uid);
  revalidatePath("/team");
}

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

  const { data: myOrgs } = await sb
    .from("org_members")
    .select("org_id, role, share_with_manager, organizations(id, name, slug)")
    .eq("user_id", userId);

  const dict = await getDict();
  const t = dict.team;

  if (!myOrgs || myOrgs.length === 0) {
    return <CreateFirstOrg createOrg={createOrg} t={t} />;
  }

  const primary = myOrgs[0];
  const orgId = primary.org_id;
  const role = primary.role;
  const orgName = (primary as unknown as { organizations: { name: string } }).organizations.name;

  const { data: members } = await sb
    .from("org_members")
    .select("user_id, role, manager_id, share_with_manager, users(name, email, image)")
    .eq("org_id", orgId);

  const { data: invites } = await sb
    .from("org_invites")
    .select("email, role, accepted, created_at")
    .eq("org_id", orgId)
    .eq("accepted", false);

  const isManager = role === "owner" || role === "manager";
  const h = await headers();
  const host = h.get("host") ?? "cowork.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

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
              <TeamPulse members={(members as unknown as Member[]) ?? []} statLabel={t.sharingStat} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.inviteMember}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={inviteMember} className="space-y-3">
                <input type="hidden" name="org_id" value={orgId} />
                <input
                  name="email"
                  type="email"
                  placeholder={t.invitePlaceholder}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <select
                  name="role"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="member">{t.inviteMember_role}</option>
                  <option value="manager">{t.inviteManager_role}</option>
                </select>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  {t.inviteSend}
                </button>
              </form>
              {invites && invites.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">{t.pendingInvites}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {invites.map((i) => (
                      <li key={i.email}>
                        {i.email} — share link:{" "}
                        <code className="rounded bg-slate-100 px-1">
                          {baseUrl}/invite
                        </code>
                      </li>
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
          <span className="text-xs text-slate-500">{members?.length ?? 0}</span>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-slate-100">
            {(members as unknown as Member[])?.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {m.users?.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.users.image} alt="" className="h-8 w-8 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {m.users?.name ?? m.users?.email}
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
          <form action={togglePrivacy} className="flex items-center gap-4">
            <input type="hidden" name="org_id" value={orgId} />
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="share"
                defaultChecked={primary.share_with_manager}
                className="h-4 w-4"
              />
              {t.privacyLabel}
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              {t.save}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">{t.privacyNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamPulse({ members, statLabel }: { members: Member[]; statLabel: string }) {
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
  createOrg,
  t,
}: {
  createOrg: (f: FormData) => Promise<void>;
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
          <form action={createOrg} className="space-y-3">
            <input
              name="name"
              placeholder={t.createPlaceholder}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {t.createButton}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
