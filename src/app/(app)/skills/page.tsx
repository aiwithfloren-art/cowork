import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteAgentButton } from "@/components/delete-agent-button";
import { AgentTemplates } from "@/components/agent-templates";

export const metadata: Metadata = {
  title: "Skills — Sigap",
};

export default async function SkillsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: agents } = await sb
    .from("custom_agents")
    .select(
      "slug, name, emoji, description, enabled_tools, created_at, assigned_by_admin",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Pull assignment metadata (admin who assigned, optional note) for the
  // "Assigned to you" section. Soft join via cloned_agent_slug.
  const assignedSlugs = (agents ?? [])
    .filter((a) => a.assigned_by_admin)
    .map((a) => a.slug as string);
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

  const assignedAgents = (agents ?? []).filter((a) => a.assigned_by_admin);
  const personalAgents = (agents ?? []).filter((a) => !a.assigned_by_admin);
  const hasAssigned = assignedAgents.length > 0;
  const hasPersonal = personalAgents.length > 0;
  const hasAgents = hasAssigned || hasPersonal;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 md:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skills</h1>
        <p className="mt-1 text-sm text-slate-600">
          Activate pre-built skills for your team — each one comes with the
          right tools and instructions for its job. You can also create custom
          ones via the main chat.
        </p>
      </div>

      {hasAssigned && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <span>📌 Assigned to you</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              {assignedAgents.length}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {assignedAgents.map((a) => {
              const meta = assignmentMetaBySlug.get(a.slug as string);
              return (
                <Card
                  key={a.slug}
                  className="border-indigo-200 bg-indigo-50/30 transition hover:shadow-md"
                >
                  <CardContent className="flex flex-col gap-3 p-4">
                    <Link
                      href={`/skills/${a.slug}`}
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
                      <span
                        className="text-[10px] text-slate-400"
                        title="Only the admin who assigned this can remove it"
                      >
                        🔒 admin-managed
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {hasPersonal && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-900">
            Your personal skills
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {personalAgents.map((a) => (
              <Card key={a.slug} className="transition hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-4">
                  <Link
                    href={`/skills/${a.slug}`}
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
        </div>
      )}

      <div className="space-y-3">
        {hasAgents && (
          <p className="text-sm font-medium text-slate-900">
            Add another skill
          </p>
        )}
        <AgentTemplates />
      </div>
    </div>
  );
}
