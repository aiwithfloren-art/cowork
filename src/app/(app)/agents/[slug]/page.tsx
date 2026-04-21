import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Chat } from "@/components/chat";
import { getDict } from "@/lib/i18n";
import { AgentHeader } from "@/components/agent-header";
import { AgentSchedule } from "@/components/agent-schedule";
import { AgentDigests } from "@/components/agent-digests";

export default async function AgentChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data: agent } = await sb
    .from("custom_agents")
    .select(
      "id, slug, name, emoji, description, system_prompt, enabled_tools, schedule_cron, objectives",
    )
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  if (!agent) notFound();

  const { data: digests } = await sb
    .from("agent_digests")
    .select("id, summary, status, created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const dict = await getDict();

  // Strip the hardened wrapper so user sees just their role description.
  function extractRoleDescription(sp: string | null): string {
    if (!sp) return "";
    const begin = sp.indexOf("=== BEGIN ROLE ===");
    const end = sp.indexOf("=== END ROLE ===");
    if (begin === -1 || end === -1) return sp.trim();
    return sp.slice(begin + "=== BEGIN ROLE ===".length, end).trim();
  }
  const roleDescription = extractRoleDescription(agent.system_prompt);

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Agents
        </Link>
      </div>
      <AgentHeader
        name={agent.name}
        emoji={agent.emoji ?? "🤖"}
        description={agent.description ?? ""}
        enabledTools={agent.enabled_tools ?? []}
        roleDescription={roleDescription}
        slug={agent.slug}
      />
      <AgentSchedule
        slug={agent.slug}
        scheduleCron={agent.schedule_cron ?? null}
        objectives={agent.objectives ?? []}
      />
      <div className="h-[520px]">
        <Chat t={dict.chat} agentSlug={agent.slug} />
      </div>
      <AgentDigests initial={(digests ?? []) as Parameters<typeof AgentDigests>[0]["initial"]} />
    </div>
  );
}
