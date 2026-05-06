import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteAgentButton } from "@/components/delete-agent-button";
import { CreateAgentButton } from "@/components/create-agent-button";
import { TeamAgentCard } from "@/components/team-agent-card";
import { AgentTemplates } from "@/components/agent-templates";
import type { OrgMember } from "@/components/skill-card";

export const metadata: Metadata = {
  title: "Agents — Sigap",
};

export const dynamic = "force-dynamic";

/**
 * Unified Agents hub. Replaces the fragmented /skills + /team/skills +
 * legacy /agents trio. Single page where admins see:
 *   1. Team agents (org-published templates, with per-template assignment
 *      counts and one-click "Assign to..." button)
 *   2. My drafts (personal custom_agents not yet published / published
 *      but not assigned)
 *   3. Assigned to me (if admin is also receiving assignments)
 *
 * Members see a simpler view: Assigned to you + My personal agents.
 */
export default async function AgentsHubPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const orgId = (membership?.org_id as string | null) ?? null;
  const role = (membership?.role as string | null) ?? null;
  const isAdmin = role === "owner" || role === "manager";

  const { data: personalAgents } = await sb
    .from("custom_agents")
    .select(
      "slug, name, emoji, description, enabled_tools, assigned_by_admin, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const assignedToMe = (personalAgents ?? []).filter(
    (a) => a.assigned_by_admin,
  );
  // Personal drafts that are NOT assigned-by-admin AND NOT already
  // published as a team template (we'll filter those out below once we
  // know which slugs are published — keeps listing dedup'd so the same
  // agent doesn't show up in both "My drafts" and "Team agents".)
  const myDraftsRaw = (personalAgents ?? []).filter(
    (a) => !a.assigned_by_admin,
  );

  // Pull assignment metadata (admin who assigned + note) for the
  // Assigned-to-me cards.
  const assignedSlugs = assignedToMe.map((a) => a.slug as string);
  const assignmentMetaBySlug = new Map<
    string,
    { admin_name: string | null; note: string | null }
  >();
  if (assignedSlugs.length > 0) {
    const { data: rows } = await sb
      .from("agent_assignments")
      .select("cloned_agent_slug, assignment_note, assigned_by_user_id")
      .eq("assigned_to_user_id", userId)
      .eq("status", "active")
      .in("cloned_agent_slug", assignedSlugs);
    const adminIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.assigned_by_user_id as string | null)
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const { data: adminRows } = adminIds.length
      ? await sb.from("users").select("id, name, email").in("id", adminIds)
      : { data: [] };
    const adminMap = new Map(
      (adminRows ?? []).map((u) => [
        u.id as string,
        (u.name as string | null) ?? (u.email as string),
      ]),
    );
    (rows ?? []).forEach((r) => {
      assignmentMetaBySlug.set(r.cloned_agent_slug as string, {
        admin_name:
          (r.assigned_by_user_id &&
            adminMap.get(r.assigned_by_user_id as string)) ||
          null,
        note: (r.assignment_note as string | null) ?? null,
      });
    });
  }

  type TeamAgent = {
    template_id: string;
    name: string;
    emoji: string | null;
    description: string | null;
    enabled_tools: string[];
    assigned_count: number;
    assigned_user_ids: string[];
    source_slug: string | null;
  };
  let teamAgents: TeamAgent[] = [];
  let orgMembers: OrgMember[] = [];
  // Slugs of personal agents already published as team templates — filtered
  // out of My drafts to avoid showing the same agent twice.
  let publishedSourceSlugs = new Set<string>();
  if (isAdmin && orgId) {
    const { data: tmpls } = await sb
      .from("org_agent_templates")
      .select(
        "id, name, emoji, description, enabled_tools, source_slug, visibility",
      )
      .eq("org_id", orgId)
      .order("published_at", { ascending: false });

    const tmplIds = (tmpls ?? []).map((t) => t.id as string);
    const { data: assignRows } = tmplIds.length
      ? await sb
          .from("agent_assignments")
          .select("template_id, assigned_to_user_id")
          .in("template_id", tmplIds)
          .eq("status", "active")
      : { data: [] };
    const byTmpl = new Map<string, string[]>();
    (assignRows ?? []).forEach((r) => {
      const list = byTmpl.get(r.template_id as string) ?? [];
      list.push(r.assigned_to_user_id as string);
      byTmpl.set(r.template_id as string, list);
    });

    teamAgents = (tmpls ?? []).map((t) => ({
      template_id: t.id as string,
      name: t.name as string,
      emoji: (t.emoji as string | null) ?? null,
      description: (t.description as string | null) ?? null,
      enabled_tools: (t.enabled_tools as string[] | null) ?? [],
      assigned_count: (byTmpl.get(t.id as string) ?? []).length,
      assigned_user_ids: byTmpl.get(t.id as string) ?? [],
      source_slug: (t.source_slug as string | null) ?? null,
    }));

    publishedSourceSlugs = new Set(
      (tmpls ?? [])
        .map((t) => t.source_slug as string | null)
        .filter((s): s is string => Boolean(s)),
    );

    const { data: memberRows } = await sb
      .from("org_members")
      .select("user_id, role")
      .eq("org_id", orgId);
    const memberIds = (memberRows ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== userId);
    const { data: userRows } = memberIds.length
      ? await sb.from("users").select("id, email, name").in("id", memberIds)
      : { data: [] };
    const userById = new Map(
      (userRows ?? []).map((u) => [
        u.id as string,
        {
          email: (u.email as string) ?? "",
          name: (u.name as string | null) ?? null,
        },
      ]),
    );
    orgMembers = (memberRows ?? [])
      .filter((m) => (m.user_id as string) !== userId)
      .map((m) => {
        const u = userById.get(m.user_id as string);
        return {
          user_id: m.user_id as string,
          email: u?.email ?? "",
          name: u?.name ?? null,
          role: (m.role as string) ?? "member",
        };
      });
  }

  const myDrafts = myDraftsRaw.filter(
    (a) => !publishedSourceSlugs.has(a.slug as string),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agents</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAdmin
              ? "Bikin AI agent buat tim, assign ke karyawan, atau pakai sendiri."
              : "Lihat agent yang ditugaskan ke kamu, dan bikin agent personal."}
          </p>
        </div>
        <CreateAgentButton />
      </div>

      {/* SECTION 1 — Assigned to me (priority for both admin + member) */}
      {assignedToMe.length > 0 && (
        <section className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <span>📌 Assigned to you</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              {assignedToMe.length}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {assignedToMe.map((a) => {
              const meta = assignmentMetaBySlug.get(a.slug as string);
              return (
                <Card
                  key={a.slug}
                  className="border-indigo-200 bg-indigo-50/30 transition hover:shadow-md"
                >
                  <CardContent className="flex flex-col gap-3 p-4">
                    <Link
                      href={`/agents/${a.slug}`}
                      className="flex items-start gap-3"
                    >
                      <span className="text-3xl">{a.emoji ?? "🤖"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{a.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {a.description ?? "—"}
                        </p>
                      </div>
                    </Link>
                    {meta?.admin_name && (
                      <p className="text-[11px] text-slate-500">
                        Assigned by{" "}
                        <span className="font-medium text-slate-700">
                          {meta.admin_name}
                        </span>
                      </p>
                    )}
                    {meta?.note && (
                      <p className="rounded border-l-2 border-indigo-300 bg-white px-2 py-1.5 text-[11px] text-slate-600">
                        📝 {meta.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{(a.enabled_tools ?? []).length} tools</span>
                      <span title="Cuma admin yang bisa unassign">
                        🔒 admin-managed
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 2 — Team Agents (admin only) */}
      {isAdmin && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <span>👥 Team agents</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                {teamAgents.length}
              </span>
            </p>
            {teamAgents.length > 0 && (
              <Link
                href="/team/admin/assignments"
                className="text-xs text-indigo-600 hover:text-indigo-700"
              >
                See all assignments →
              </Link>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Agent yang udah di-publish ke org. Klik &quot;Assign&quot; buat
            ngasih ke karyawan.
          </p>
          {teamAgents.length === 0 ? (
            <Card>
              <CardContent>
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-600">
                    Belum ada team agent.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Bikin agent personal dulu di section bawah, terus klik{" "}
                    <strong>&quot;Assign to employee&quot;</strong> di detail
                    agent — auto-publish + assign sekaligus.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {teamAgents.map((t) => (
                <TeamAgentCard
                  key={t.template_id}
                  templateId={t.template_id}
                  name={t.name}
                  emoji={t.emoji}
                  description={t.description}
                  toolsCount={t.enabled_tools.length}
                  assignedCount={t.assigned_count}
                  assignedUserIds={t.assigned_user_ids}
                  members={orgMembers}
                  sourceSlug={t.source_slug}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3 — My drafts / personal */}
      <section className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <span>{isAdmin ? "🧪 My drafts" : "🤖 My personal agents"}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            {myDrafts.length}
          </span>
        </p>
        {isAdmin && (
          <p className="text-xs text-slate-500">
            Agent personal kamu. Belum kelihatan tim sampai di-assign / publish.
          </p>
        )}
        {myDrafts.length === 0 ? (
          <Card>
            <CardContent>
              <div className="py-6 text-center text-sm text-slate-500">
                Belum ada agent. Klik <strong>&quot;+ Create new&quot;</strong>{" "}
                di atas.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {myDrafts.map((a) => (
              <Card key={a.slug} className="transition hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-4">
                  <Link
                    href={`/agents/${a.slug}`}
                    className="flex items-start gap-3"
                  >
                    <span className="text-3xl">{a.emoji ?? "🤖"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{a.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {a.description ?? "—"}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{(a.enabled_tools ?? []).length} tools</span>
                    <DeleteAgentButton
                      slug={a.slug}
                      name={a.name}
                      emoji={a.emoji}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 4 — Starter library (collapsed by default, useful for new orgs) */}
      <section className="space-y-3 border-t border-slate-200 pt-8">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <span>🚀 Starter library</span>
        </p>
        <p className="text-xs text-slate-500">
          Pre-built agent templates buat tim yang baru mulai. Klik install
          buat dapet sebagai personal agent.
        </p>
        <AgentTemplates />
      </section>
    </div>
  );
}
