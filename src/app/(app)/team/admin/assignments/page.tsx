import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { TeamSubnav } from "@/components/team-subnav";
import { UnassignButton } from "@/components/unassign-button";

export const metadata: Metadata = { title: "Assignments — Sigap" };

export default async function AdminAssignmentsPage() {
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
  if (
    !membership?.org_id ||
    !["owner", "manager"].includes(membership.role as string)
  ) {
    redirect("/dashboard");
  }

  const isOwner = membership.role === "owner";

  // Pull active assignments + join template + assignee + assigner
  const { data: assignments } = await sb
    .from("agent_assignments")
    .select(
      "id, template_id, assigned_to_user_id, assigned_by_user_id, assignment_note, assigned_at",
    )
    .eq("org_id", membership.org_id)
    .eq("status", "active")
    .order("assigned_at", { ascending: false });

  const tmplIds = Array.from(
    new Set((assignments ?? []).map((a) => a.template_id as string)),
  );
  const userIds = Array.from(
    new Set(
      (assignments ?? []).flatMap((a) =>
        [a.assigned_to_user_id as string, a.assigned_by_user_id as string].filter(
          Boolean,
        ),
      ),
    ),
  );

  const { data: tmpls } = tmplIds.length
    ? await sb
        .from("org_agent_templates")
        .select("id, name, emoji")
        .in("id", tmplIds)
    : { data: [] };
  const { data: users } = userIds.length
    ? await sb.from("users").select("id, name, email").in("id", userIds)
    : { data: [] };

  const tmplMap = new Map(
    (tmpls ?? []).map((t) => [
      t.id as string,
      {
        name: t.name as string,
        emoji: (t.emoji as string | null) ?? "🤖",
      },
    ]),
  );
  const userMap = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      {
        name: (u.name as string | null) ?? null,
        email: (u.email as string) ?? "",
      },
    ]),
  );

  // Group by employee for the table view
  type Row = {
    employee_id: string;
    employee_label: string;
    employee_email: string;
    items: Array<{
      assignment_id: string;
      template_id: string;
      template_name: string;
      template_emoji: string;
      assigner_label: string;
      note: string | null;
      assigned_at: string;
    }>;
  };
  const byEmployee = new Map<string, Row>();
  (assignments ?? []).forEach((a) => {
    const empId = a.assigned_to_user_id as string;
    const emp = userMap.get(empId);
    const tmpl = tmplMap.get(a.template_id as string);
    const assigner = a.assigned_by_user_id
      ? userMap.get(a.assigned_by_user_id as string)
      : null;
    if (!emp || !tmpl) return;
    if (!byEmployee.has(empId)) {
      byEmployee.set(empId, {
        employee_id: empId,
        employee_label: emp.name ?? emp.email,
        employee_email: emp.email,
        items: [],
      });
    }
    byEmployee.get(empId)!.items.push({
      assignment_id: a.id as string,
      template_id: a.template_id as string,
      template_name: tmpl.name,
      template_emoji: tmpl.emoji,
      assigner_label: assigner?.name ?? assigner?.email ?? "—",
      note: (a.assignment_note as string | null) ?? null,
      assigned_at: a.assigned_at as string,
    });
  });

  const rows = Array.from(byEmployee.values()).sort((a, b) =>
    a.employee_label.localeCompare(b.employee_label),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 md:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Assignments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Lihat agent yang lagi di-assign ke tim. Cuma kamu (admin) yang bisa
          assign atau unassign.
        </p>
      </div>
      <TeamSubnav showAdmin={isOwner} />

      <div>
        <Link
          href="/team/skills"
          className="inline-block rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
        >
          + Assign new agent
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <div className="py-8 text-center">
              <p className="text-3xl">📌</p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                Belum ada assignment.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Buka <Link href="/team/skills" className="text-indigo-600 hover:underline">Skill Hub</Link>{" "}
                → klik &quot;Assign to…&quot; di skill yang udah di-publish.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.employee_id}>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {row.employee_label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.employee_email}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {row.items.length} agent
                    {row.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {row.items.map((it) => (
                    <div
                      key={it.assignment_id}
                      className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                    >
                      <span className="text-xl">{it.template_emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {it.template_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          assigned by{" "}
                          <span className="font-medium text-slate-700">
                            {it.assigner_label}
                          </span>{" "}
                          · {new Date(it.assigned_at).toLocaleDateString()}
                        </p>
                        {it.note && (
                          <p className="mt-1 rounded border-l-2 border-indigo-300 bg-white px-2 py-1 text-xs text-slate-600">
                            📝 {it.note}
                          </p>
                        )}
                      </div>
                      <UnassignButton
                        templateId={it.template_id}
                        userId={row.employee_id}
                        templateName={it.template_name}
                        employeeLabel={row.employee_label}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
