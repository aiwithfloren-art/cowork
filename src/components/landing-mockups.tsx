/**
 * Static visual mockups used on the landing page to show what Sigap
 * actually looks like — without requiring real screenshots. Each
 * component is a faithful HTML/CSS rendering that mirrors the live
 * /agents page styling, so prospects can recognize the product when
 * they sign up.
 *
 * Server components — pure presentation, no client interactivity.
 */

export function ChatCreatingAgentMockup({ locale }: { locale: "en" | "id" }) {
  const userMsg =
    locale === "id"
      ? "Bikin AI agent buat content marketing tim B2B SaaS, pake Canva + Notion. Tone: confident, anti-jargon."
      : "Build an AI agent for B2B SaaS content marketing, using Canva + Notion. Tone: confident, anti-jargon.";
  const aiReply =
    locale === "id"
      ? "✅ Agent **Content Creator** siap dipake."
      : "✅ Agent **Content Creator** is ready to use.";
  const tools =
    "canva_autofill_template, canva_export_design, notion_create_page, web_search, generate_image, save_note";
  const assignLabel =
    locale === "id" ? "Assign ke karyawan?" : "Assign to an employee?";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-slate-500">
          Sigap · /dashboard
        </span>
      </div>

      <div className="space-y-3 px-5 py-5">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-md rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
            {userMsg}
          </div>
        </div>

        {/* AI thinking indicator (faded) */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs">
            🤖
          </div>
          <div className="text-xs text-slate-400">
            calling create_ai_employee...
          </div>
        </div>

        {/* AI reply */}
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs">
            🤖
          </div>
          <div className="max-w-md rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm">
            <p
              dangerouslySetInnerHTML={{
                __html: aiReply.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
              }}
            />
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✍️</span>
                <span className="font-medium text-slate-900">
                  Content Creator
                </span>
              </div>
              <p className="mt-1.5 break-all font-mono text-[10px] text-slate-500">
                {tools}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-600">{assignLabel}</span>
              <button
                type="button"
                disabled
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white opacity-90"
              >
                Sarah ▾
              </button>
              <button
                type="button"
                disabled
                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-90"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentsGridMockup({ locale }: { locale: "en" | "id" }) {
  const heading = locale === "id" ? "Agents" : "Agents";
  const sub =
    locale === "id"
      ? "Bikin AI agent buat tim, assign ke karyawan, atau pakai sendiri."
      : "Build AI agents for your team, assign to employees, or use yourself.";
  const teamLabel = locale === "id" ? "👥 Team agents" : "👥 Team agents";
  const myLabel = locale === "id" ? "🧪 My drafts" : "🧪 My drafts";
  const createBtn = locale === "id" ? "+ Create new" : "+ Create new";
  const assignBtn = locale === "id" ? "Assign" : "Assign";
  const openBtn = locale === "id" ? "Open" : "Open";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-slate-500">Sigap · /agents</span>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{heading}</h3>
            <p className="mt-0.5 text-xs text-slate-600">{sub}</p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-90"
          >
            {createBtn} ▾
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Team agents section */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-900">
              <span>{teamLabel}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                3
              </span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <MockAgentCard
                emoji="✍️"
                name="Content Creator"
                desc="Drafts + Canva carousel"
                meta="6 tools · 👥 2 assigned"
                primaryBtn={openBtn}
                secondaryBtn={`${assignBtn} (2)`}
              />
              <MockAgentCard
                emoji="📞"
                name="Sales Follow-up"
                desc="Auto draft replies"
                meta="4 tools · 👥 1 assigned"
                primaryBtn={openBtn}
                secondaryBtn={`${assignBtn} (1)`}
              />
            </div>
          </div>

          {/* My drafts */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-900">
              <span>{myLabel}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                2
              </span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <MockAgentCard
                emoji="🤝"
                name="Onboarding HR"
                desc="Welcome new hires"
                meta="5 tools"
                primaryBtn={openBtn}
              />
              <MockAgentCard
                emoji="📊"
                name="Weekly Reporter"
                desc="Auto Friday summary"
                meta="3 tools · ⏰ Daily 5pm"
                primaryBtn={openBtn}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockAgentCard({
  emoji,
  name,
  desc,
  meta,
  primaryBtn,
  secondaryBtn,
}: {
  emoji: string;
  name: string;
  desc: string;
  meta: string;
  primaryBtn: string;
  secondaryBtn?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="text-2xl">{emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{name}</p>
          <p className="truncate text-[11px] text-slate-500">{desc}</p>
          <p className="mt-1 truncate text-[10px] text-slate-400">{meta}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          disabled
          className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-90"
        >
          {primaryBtn}
        </button>
        {secondaryBtn && (
          <button
            type="button"
            disabled
            className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white opacity-90"
          >
            👥 {secondaryBtn}
          </button>
        )}
      </div>
    </div>
  );
}

export function AssignModalMockup({ locale }: { locale: "en" | "id" }) {
  const title =
    locale === "id"
      ? "Assign \"Content Creator\""
      : "Assign \"Content Creator\"";
  const sub =
    locale === "id"
      ? "Pilih employee yang dapet agent ini"
      : "Pick which employees get this agent";
  const noteLabel =
    locale === "id" ? "Note (optional)" : "Note (optional)";
  const note =
    locale === "id"
      ? "Pakai buat klien Acme Brand — focus on B2B tone"
      : "Use for Acme Brand client — focus on B2B tone";
  const cancelBtn = locale === "id" ? "Batal" : "Cancel";
  const assignBtn =
    locale === "id" ? "Assign to 2 employees" : "Assign to 2 employees";

  return (
    <div className="rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-3xl">✍️</span>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{sub}</p>
        </div>
      </div>

      <div className="mb-4 space-y-1.5 rounded-lg border border-slate-200 p-2">
        <MockMember name="Sarah Putri" email="sarah@acme.id" checked />
        <MockMember name="Budi Wijaya" email="budi@acme.id" checked />
        <MockMember name="Andi Pratama" email="andi@acme.id" />
      </div>

      <div className="mb-4">
        <p className="mb-1 text-xs font-medium text-slate-700">{noteLabel}</p>
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {note}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled
          className="rounded-md px-3 py-1.5 text-xs text-slate-600 opacity-90"
        >
          {cancelBtn}
        </button>
        <button
          type="button"
          disabled
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-90"
        >
          {assignBtn}
        </button>
      </div>
    </div>
  );
}

function MockMember({
  name,
  email,
  checked,
}: {
  name: string;
  email: string;
  checked?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
      <div
        className={`flex h-4 w-4 items-center justify-center rounded border ${
          checked
            ? "border-indigo-600 bg-indigo-600"
            : "border-slate-300 bg-white"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M2 5l2 2 4-4" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="truncate text-[11px] text-slate-500">{email}</p>
      </div>
    </div>
  );
}
