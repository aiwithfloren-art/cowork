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
import { QuickAssignButton } from "@/components/quick-assign-button";

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
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const canPublish =
    membership?.role === "owner" || membership?.role === "manager";

  // Load org members + already-assigned user ids so the Assign modal can
  // preselect / hide. Only needed if admin and there's a real org context.
  type Member = {
    user_id: string;
    email: string;
    name: string | null;
    role: string;
  };
  let orgMembers: Member[] = [];
  let alreadyAssignedIds: string[] = [];
  if (canPublish && membership?.org_id) {
    const { data: memberRows } = await sb
      .from("org_members")
      .select("user_id, role")
      .eq("org_id", membership.org_id);
    const memberIds = (memberRows ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== userId);
    const { data: userRows } = memberIds.length
      ? await sb
          .from("users")
          .select("id, email, name")
          .in("id", memberIds)
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

    // Already-assigned: any active assignment whose template was published
    // from this exact agent slug.
    const { data: tmplRow } = await sb
      .from("org_agent_templates")
      .select("id")
      .eq("org_id", membership.org_id)
      .eq("source_slug", slug)
      .maybeSingle();
    if (tmplRow?.id) {
      const { data: assignRows } = await sb
        .from("agent_assignments")
        .select("assigned_to_user_id")
        .eq("template_id", tmplRow.id as string)
        .eq("status", "active");
      alreadyAssignedIds = (assignRows ?? []).map(
        (r) => r.assigned_to_user_id as string,
      );
    }
  }

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
          <div className="flex items-center gap-2">
            <QuickAssignButton
              agentSlug={agent.slug}
              agentName={agent.name}
              agentEmoji={agent.emoji ?? null}
              members={orgMembers}
              alreadyAssignedUserIds={alreadyAssignedIds}
            />
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
          </div>
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
