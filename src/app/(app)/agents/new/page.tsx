import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { getDict, getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Create AI Agent — Sigap",
};

export const dynamic = "force-dynamic";

/**
 * Dedicated agent-creation chat page. Separate from the main /dashboard
 * chat so the user has a focused canvas — only goal here is "build a new
 * AI agent". Same Chat component + /api/chat backend (so create_ai_employee
 * is in scope), but with a pre-seeded intro and tighter framing.
 */
export default async function CreateAgentPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const dict = await getDict();
  const locale = await getLocale();
  const firstName = session.user.name?.split(" ")[0] ?? "there";

  const introIntro =
    locale === "id"
      ? `Hai ${firstName}! 👋 Aku bantuin bikin AI agent baru.`
      : `Hi ${firstName}! 👋 Let's build a new AI agent together.`;
  const introHowto =
    locale === "id"
      ? "Cerita aja apa role agent-nya — aku tanya detail yang kurang, terus bikinin agent-nya. Contoh:"
      : "Just describe the role — I'll ask for missing details, then build it. Examples:";

  const examples =
    locale === "id"
      ? [
          "Bikin agent buat content marketing tim B2B SaaS, pake Canva + Notion",
          "Bikin agent HR onboarding karyawan baru, kirim welcome email otomatis",
          "Bikin agent yang tiap pagi cek news + bikin briefing Slack",
        ]
      : [
          "Build a content marketing agent for B2B SaaS, using Canva + Notion",
          "Build an HR onboarding agent that sends welcome emails automatically",
          "Build an agent that checks news daily and posts a Slack briefing",
        ];

  return (
    <div className="mx-auto flex h-[calc(100vh-72px)] max-w-3xl flex-col px-4 md:px-6">
      <div className="border-b border-slate-200 py-4">
        <Link
          href="/agents"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← {locale === "id" ? "Kembali ke Agents" : "Back to Agents"}
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          🤖 {locale === "id" ? "Bikin AI Agent Baru" : "Create new AI Agent"}
        </h1>
      </div>

      <div className="rounded-md border-x border-slate-100 bg-slate-50/50 px-4 py-4 text-sm text-slate-700">
        <p>{introIntro}</p>
        <p className="mt-1.5 text-slate-600">{introHowto}</p>
        <ul className="mt-2 space-y-1 text-xs">
          {examples.map((ex, i) => (
            <li key={i} className="text-slate-600">
              &middot; <em>&quot;{ex}&quot;</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-hidden">
        <Chat t={dict.chat} />
      </div>
    </div>
  );
}
