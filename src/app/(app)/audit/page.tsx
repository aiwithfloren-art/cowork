import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AuditPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: log } = await sb
    .from("audit_log")
    .select("id, actor_id, action, question, answer, created_at, users:actor_id(name, email)")
    .eq("target_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your audit log</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything managers have asked the AI about you. You have full transparency.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manager queries</CardTitle>
        </CardHeader>
        <CardContent>
          {!log || log.length === 0 ? (
            <p className="text-sm text-slate-500">No queries yet.</p>
          ) : (
            <ul className="space-y-4">
              {log.map((l) => {
                const actor = (l as unknown as { users: { name: string | null; email: string } | null }).users;
                return (
                  <li key={l.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{actor?.name ?? actor?.email ?? "Unknown"}</span>
                      <span>{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-900">Q: {l.question}</p>
                    <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">A: {l.answer}</p>
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
