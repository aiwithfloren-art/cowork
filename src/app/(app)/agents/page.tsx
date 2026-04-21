import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteAgentButton } from "@/components/delete-agent-button";

export default async function AgentsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: agents } = await sb
    .from("custom_agents")
    .select("slug, name, emoji, description, enabled_tools, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Agents</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sub-agents you&apos;ve built. Each one has a focused role and a
          subset of tools. To create a new one, just tell Sigap in the main
          chat:{" "}
          <span className="font-mono text-indigo-700">
            &quot;bikin agent Siska buat HR…&quot;
          </span>
        </p>
      </div>

      {(!agents || agents.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500">No agents yet.</p>
            <p className="mt-2 text-xs text-slate-400">
              Go to{" "}
              <Link href="/dashboard" className="text-indigo-600 underline">
                main chat
              </Link>{" "}
              and say &quot;bikin agent X buat Y&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((a) => (
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
                  <DeleteAgentButton slug={a.slug} name={a.name} emoji={a.emoji} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
