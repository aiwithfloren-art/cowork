"use client";

import { useRouter } from "next/navigation";

type Template = {
  emoji: string;
  title: string;
  description: string;
  prompt: string;
};

const TEMPLATES: Template[] = [
  {
    emoji: "🧑‍💼",
    title: "HR Assistant",
    description: "Onboarding, leave tracking, reminder karyawan",
    prompt:
      "mau bikin agent HR namanya Siska, bantu onboarding + leave tracking + kirim reminder karyawan, tone casual",
  },
  {
    emoji: "📊",
    title: "Sales Assistant",
    description: "Follow up leads, draft outreach email",
    prompt:
      "mau bikin agent sales yang bantu follow up leads, draft email outreach, tone profesional",
  },
  {
    emoji: "🔬",
    title: "Research Assistant",
    description: "Riset market + kompetitor, bikin report",
    prompt:
      "bikin agent research untuk riset market dan kompetitor, bikin summary report mingguan, tone formal",
  },
  {
    emoji: "🎨",
    title: "Content Creator",
    description: "Bikin caption, riset trending, generate image",
    prompt:
      "bikin agent content creator buat Instagram dan TikTok, caption + riset trending + generate image, tone casual energetic",
  },
];

export function AgentTemplates() {
  const router = useRouter();

  function useTemplate(prompt: string) {
    // Stash the prompt in sessionStorage so /dashboard auto-fills.
    try {
      sessionStorage.setItem("agent_template_prompt", prompt);
    } catch {}
    router.push("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-900">
          Atau pilih template buat mulai cepat
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Klik card → dibawa ke main chat dengan prompt siap-kirim. Edit
          atau kirim langsung sesuai kebutuhan kamu.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => useTemplate(t.prompt)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{t.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {t.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
