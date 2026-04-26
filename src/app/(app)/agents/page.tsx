import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteAgentButton } from "@/components/delete-agent-button";
import { AgentTemplates } from "@/components/agent-templates";

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

  const hasAgents = !!agents && agents.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 md:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Employees</h1>
        <p className="mt-1 text-sm text-slate-600">
          Activate pre-built AI agents for your team — each one comes with the
          right tools and skills for its role. You can also create custom ones
          via the main chat.
        </p>
      </div>

      {/* User's already-activated agents (shown only if any exist) */}
      {hasAgents && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-900">
            Your activated agents
          </p>
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

      {/* Browse templates — always visible (V1: always show marketplace
          so users can keep adding agents, not just on empty state). */}
      <div className="space-y-3">
        {hasAgents && (
          <p className="text-sm font-medium text-slate-900">
            Add another AI employee
          </p>
        )}
        <AgentTemplates />
      </div>
    </div>
  );
}
