import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Chat } from "@/components/chat";
import { getDict } from "@/lib/i18n";
import { AgentHeader } from "@/components/agent-header";
import { AgentSchedule } from "@/components/agent-schedule";
import { AgentDigests } from "@/components/agent-digests";
import { PublishAgentButton } from "@/components/publish-agent-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { title: "Skill — Sigap" };
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("custom_agents")
    .select("name")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();
  return { title: data?.name ? `${data.name} — Sigap` : "Skill — Sigap" };
}

export default async function SkillDetailPage({
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

  const { data: membership } = await sb
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const canPublish =
    membership?.role === "owner" || membership?.role === "manager";

  const dict = await getDict();

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
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/skills"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Skills
        </Link>
        {canPublish && (
          <PublishAgentButton
            slug={agent.slug}
            agentName={agent.name}
            label={dict.skills.publishBtn}
            confirmTitle={dict.skills.publishConfirmTitle}
            confirmBody={dict.skills.publishConfirmBody}
            successText={dict.skills.publishSuccess}
            updatedText={dict.skills.publishUpdated}
            errorText={dict.skills.publishError}
            cancelText={dict.skills.cancel}
            publishText={dict.skills.publishAction}
          />
        )}
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
