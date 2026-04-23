import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { ApprovalActions } from "@/components/approval-actions";

type Approval = {
  id: string;
  requester_id: string;
  tool_name: string;
  summary: string;
  status: string;
  created_at: string;
  expires_at: string;
  tool_args: Record<string, unknown>;
  requester: { name: string | null; email: string } | null;
};

const TOOL_LABELS: Record<string, { emoji: string; label: string }> = {
  send_email: { emoji: "✉️", label: "Send Email" },
  broadcast_to_team: { emoji: "📢", label: "Broadcast" },
  assign_task_to_member: { emoji: "📋", label: "Assign Task" },
  create_artifact: { emoji: "📄", label: "Create Artifact" },
  create_google_doc: { emoji: "📘", label: "Create Google Doc" },
};

export default async function ApprovalsPage() {
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
  const orgId = membership?.org_id as string | undefined;
  const role = (membership?.role as string | null) ?? null;
  const canDecide = role === "owner" || role === "manager";

  const { data } = orgId
    ? await sb
        .from("pending_approvals")
        .select(
          `id, requester_id, tool_name, summary, status, created_at, expires_at, tool_args,
           requester:requester_id(name, email)`,
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };
  const rows = ((data ?? []) as unknown as Approval[]) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
        <p className="mt-1 text-sm text-slate-600">
          {canDecide
            ? "Review permintaan AI dari tim kamu — approve atau deny sebelum tool beneran jalan."
            : "Riwayat permintaan approval — cuma owner/manager yang bisa decide."}
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-2xl">✅</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              Ga ada pending approval
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Kalau tim lo minta AI kirim email/broadcast/assign task yang
              perlu approval, bakal muncul di sini.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pending ({pending.length})
          </h2>
          {pending.map((a) => {
            const tl = TOOL_LABELS[a.tool_name] ?? {
              emoji: "⚙️",
              label: a.tool_name,
            };
            const requesterLabel =
              a.requester?.name ?? a.requester?.email ?? "Unknown";
            return (
              <Card key={a.id} className="border-amber-200">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{tl.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {tl.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Diminta oleh <strong>{requesterLabel}</strong> ·{" "}
                        {new Date(a.created_at).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {a.summary}
                  </p>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-700">
                      Lihat detail
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                      {JSON.stringify(a.tool_args, null, 2)}
                    </pre>
                  </details>
                  {canDecide && <ApprovalActions approvalId={a.id} />}
                  {!canDecide && (
                    <p className="text-xs text-slate-400">
                      Menunggu keputusan owner/manager.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            History
          </h2>
          {decided.slice(0, 20).map((a) => {
            const tl = TOOL_LABELS[a.tool_name] ?? {
              emoji: "⚙️",
              label: a.tool_name,
            };
            const badge =
              a.status === "approved" || a.status === "executed"
                ? { color: "bg-emerald-100 text-emerald-700", label: "APPROVED" }
                : a.status === "denied"
                  ? { color: "bg-red-100 text-red-700", label: "DENIED" }
                  : a.status === "timeout"
                    ? { color: "bg-slate-100 text-slate-600", label: "TIMEOUT" }
                    : { color: "bg-amber-100 text-amber-700", label: a.status.toUpperCase() };
            return (
              <Card key={a.id}>
                <CardContent className="flex items-center gap-3 p-3 text-sm">
                  <span className="text-lg">{tl.emoji}</span>
                  <span className="flex-1 truncate text-slate-700">
                    {a.summary}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
