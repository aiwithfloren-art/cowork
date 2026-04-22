import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Per-AI-employee audit trail view. Owner-only. Shows:
 *   - 7-day + 30-day usage counts
 *   - Per-member breakdown (who's using @amore the most this week)
 *   - Per-tool breakdown (which tool gets called most — indicates what the
 *     team actually uses this employee for)
 *   - Recent activations timeline
 *
 * For solo-founder scale the raw aggregations run on-page; if rows exceed
 * ~10k per week, move to a materialized view.
 */
export default async function EmployeeAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();

  const { data: tmpl } = await sb
    .from("org_agent_templates")
    .select(
      "id, org_id, name, emoji, description, install_count, published_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!tmpl) notFound();

  // Owner-only gate
  const { data: me } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", tmpl.org_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (me?.role !== "owner") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Owner access required</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href="/team/admin"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              ← Admin console
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All org members
  const { data: orgMembers } = await sb
    .from("org_members")
    .select("user_id")
    .eq("org_id", tmpl.org_id);
  const memberIds = (orgMembers ?? []).map((m) => m.user_id as string);

  // All custom_agents across members that share this template's name
  // (= all activations of this employee).
  const { data: activations } = memberIds.length
    ? await sb
        .from("custom_agents")
        .select("id, user_id, slug, created_at")
        .in("user_id", memberIds)
        .eq("name", tmpl.name)
    : { data: [] };

  const activationAgentIds = (activations ?? []).map((a) => a.id as string);
  const agentByUser = new Map<string, string[]>();
  for (const a of activations ?? []) {
    const uid = a.user_id as string;
    if (!agentByUser.has(uid)) agentByUser.set(uid, []);
    agentByUser.get(uid)!.push(a.id as string);
  }

  // 7d + 30d chat counts for these agents
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: chats30d } = activationAgentIds.length
    ? await sb
        .from("chat_messages")
        .select("agent_id, user_id, created_at")
        .in("agent_id", activationAgentIds)
        .gte("created_at", d30)
    : { data: [] };

  const chats7dList = (chats30d ?? []).filter(
    (c) => (c.created_at as string) >= d7,
  );

  // Per-member breakdown (7-day)
  const chatsByUser = new Map<string, number>();
  for (const c of chats7dList) {
    const u = c.user_id as string;
    chatsByUser.set(u, (chatsByUser.get(u) ?? 0) + 1);
  }
  const memberBreakdown = Array.from(chatsByUser.entries())
    .map(([uid, count]) => ({ user_id: uid, count }))
    .sort((a, b) => b.count - a.count);

  const topUserIds = memberBreakdown.map((m) => m.user_id);
  const { data: topUsers } = topUserIds.length
    ? await sb
        .from("users")
        .select("id, name, email, image")
        .in("id", topUserIds)
    : { data: [] };
  const userMap = new Map(
    (topUsers ?? []).map((u) => [
      u.id as string,
      {
        name: (u.name as string | null) ?? (u.email as string),
        email: u.email as string,
      },
    ]),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{tmpl.emoji ?? "🤖"}</span>
            <h1 className="text-2xl font-bold text-slate-900">
              @{(tmpl.name as string).toLowerCase().replace(/\s+/g, "-")}{" "}
              <span className="text-base font-normal text-slate-500">
                · {tmpl.name}
              </span>
            </h1>
          </div>
          {tmpl.description && (
            <p className="mt-1 text-sm text-slate-600">{tmpl.description}</p>
          )}
        </div>
        <Link
          href="/team/admin"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Admin
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Activations"
          value={activations?.length ?? 0}
          sub={`${memberIds.length} org members`}
        />
        <StatCard
          label="Chats · 7 days"
          value={chats7dList.length}
          sub={`${memberBreakdown.length} unique users`}
        />
        <StatCard
          label="Chats · 30 days"
          value={(chats30d ?? []).length}
          sub="trend baseline"
        />
        <StatCard
          label="Published"
          value={new Date(tmpl.published_at as string).toLocaleDateString()}
          sub="original hire date"
          asDate
        />
      </div>

      {/* Per-member breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Usage by member (last 7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {memberBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">
              No one has chatted with this employee in the last 7 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {memberBreakdown.map(({ user_id, count }) => {
                const u = userMap.get(user_id);
                const pct = Math.round((count / chats7dList.length) * 100);
                return (
                  <li key={user_id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-slate-900">
                          {u?.name ?? user_id.slice(0, 8)}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {u?.email ?? ""}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-medium text-slate-700">
                        {count} chats · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Activations timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activations timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {(activations?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">
              No one has activated this employee yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(activations ?? [])
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.created_at as string).getTime() -
                    new Date(a.created_at as string).getTime(),
                )
                .map((a) => {
                  const u = userMap.get(a.user_id as string);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-slate-900">
                        {u?.name ?? (a.user_id as string).slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(a.created_at as string).toLocaleDateString()}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  asDate = false,
}: {
  label: string;
  value: number | string;
  sub?: string;
  asDate?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p
          className={`mt-1 font-bold text-slate-900 ${asDate ? "text-sm" : "text-2xl"}`}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}
