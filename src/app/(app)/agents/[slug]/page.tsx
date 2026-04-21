import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Chat } from "@/components/chat";
import { getDict } from "@/lib/i18n";
import { AgentHeader } from "@/components/agent-header";

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
    .select("slug, name, emoji, description, system_prompt, enabled_tools")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  if (!agent) notFound();

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
    <div className="mx-auto flex h-[calc(100vh-120px)] max-w-4xl flex-col gap-4">
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
      <div className="flex-1 min-h-0">
        <Chat t={dict.chat} agentSlug={agent.slug} />
      </div>
    </div>
  );
}
