import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Chat } from "@/components/chat";
import { getDict } from "@/lib/i18n";

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
    .select("slug, name, emoji, description, enabled_tools")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  if (!agent) notFound();

  const dict = await getDict();

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
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <span className="text-4xl">{agent.emoji ?? "🤖"}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900">{agent.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{agent.description}</p>
          <p className="mt-2 text-xs text-slate-400">
            {(agent.enabled_tools ?? []).length} tools aktif
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Chat t={dict.chat} agentSlug={agent.slug} />
      </div>
    </div>
  );
}
