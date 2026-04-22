import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getDict } from "@/lib/i18n";
import { SkillCard, type Skill } from "@/components/skill-card";
import { TeamSubnav } from "@/components/team-subnav";

export default async function SkillsPage() {
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

  const dict = await getDict();
  const t = dict.skills;

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
            <CardTitle>{t.pageTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{t.noOrg}</p>
            <Link
              href="/team"
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              {t.goToTeam} →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = membership.role === "owner";
  const isManager = isOwner || membership.role === "manager";

  const { data: templatesAll } = await sb
    .from("org_agent_templates")
    .select(
      "id, name, emoji, description, enabled_tools, install_count, published_by, visibility, auto_deploy",
    )
    .eq("org_id", membership.org_id)
    .order("published_at", { ascending: false });

  // Enforce visibility: owner_only employees hide from everyone except owner;
  // manager_only hides from plain members.
  const templates = (templatesAll ?? []).filter((t) => {
    const v = (t.visibility as string | null) ?? "all";
    if (v === "all") return true;
    if (v === "manager_only") return isManager;
    if (v === "owner_only") return isOwner;
    return true;
  });

  const names = (templates ?? []).map((tmpl) => tmpl.name as string);
  const { data: installed } = names.length
    ? await sb
        .from("custom_agents")
        .select("name, slug")
        .eq("user_id", userId)
        .in("name", names)
    : { data: [] };
  const installedMap = new Map(
    (installed ?? []).map((a) => [a.name as string, a.slug as string]),
  );

  const publisherIds = Array.from(
    new Set(
      (templates ?? [])
        .map((tmpl) => tmpl.published_by as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const { data: publishers } = publisherIds.length
    ? await sb
        .from("users")
        .select("id, name, email")
        .in("id", publisherIds)
    : { data: [] };
  const publisherMap = new Map(
    (publishers ?? []).map((p) => [
      p.id as string,
      (p.name as string | null) ?? (p.email as string),
    ]),
  );

  const skills: Skill[] = templates.map((tmpl) => ({
    id: tmpl.id as string,
    name: tmpl.name as string,
    emoji: (tmpl.emoji as string | null) ?? null,
    description: (tmpl.description as string | null) ?? null,
    enabled_tools: (tmpl.enabled_tools as string[] | null) ?? [],
    install_count: (tmpl.install_count as number | null) ?? 0,
    published_by_name: tmpl.published_by
      ? publisherMap.get(tmpl.published_by as string) ?? null
      : null,
    installed_slug: installedMap.get(tmpl.name as string) ?? null,
    visibility: ((tmpl.visibility as string | null) ?? "all") as
      | "all"
      | "manager_only"
      | "owner_only",
    auto_deploy: Boolean(tmpl.auto_deploy),
  }));

  const cardStrings = {
    publishedBy: t.publishedBy,
    installs: t.installs,
    install: t.install,
    installing: t.installing,
    installed: t.installedBadge,
    openAgent: t.openAgent,
    remove: t.remove,
    removing: t.removing,
    confirmRemove: t.confirmRemove,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.pageSubtitle}</p>
      </div>
      <TeamSubnav showAdmin={isOwner} />

      {skills.length === 0 ? (
        <Card>
          <CardContent>
            <div className="py-8 text-center">
              <p className="text-3xl">📚</p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {t.emptyTitle}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isManager ? t.emptyOwnerSubtitle : t.emptyMemberSubtitle}
              </p>
              {isManager && (
                <Link
                  href="/agents"
                  className="mt-4 inline-block rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  {t.browseMyAgents}
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {skills.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              canManage={isManager}
              t={cardStrings}
            />
          ))}
        </div>
      )}
    </div>
  );
}
