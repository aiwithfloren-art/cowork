import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n";
import { Markdown } from "@/components/markdown";

type Msg = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const locale = await getLocale();
  const copy = {
    title: locale === "id" ? "Riwayat Chat" : "Chat History",
    sub:
      locale === "id"
        ? "Semua percakapan Anda dengan Sigap AI, dikelompokkan per sesi."
        : "All your conversations with Sigap AI, grouped by session.",
    empty:
      locale === "id"
        ? "Belum ada riwayat chat. Mulai ngobrol di dashboard."
        : "No chat history yet. Start a conversation on the dashboard.",
    emptySearch:
      locale === "id"
        ? "Tidak ada hasil untuk pencarian ini."
        : "No results for this search.",
    searchPlaceholder:
      locale === "id" ? "Cari pesan…" : "Search messages…",
    youLabel: locale === "id" ? "Anda" : "You",
    aiLabel: "Sigap",
    messagesLabel: locale === "id" ? "pesan" : "messages",
    resumeLabel: locale === "id" ? "Lanjutkan" : "Resume →",
    clearLabel: locale === "id" ? "Hapus pencarian" : "Clear",
  };

  const sb = supabaseAdmin();
  let q2 = sb
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId);

  if (query) {
    q2 = q2.ilike("content", `%${query}%`);
  }

  const { data: messages } = await q2
    .order("created_at", { ascending: false })
    .limit(200);

  const msgs = (messages ?? []) as Msg[];

  // If searching, show flat list (each matching message)
  // If not searching, group into sessions
  const useFlat = Boolean(query);
  const sessions = useFlat ? null : groupIntoSessions(msgs.reverse());
  const sortedSessions = sessions ? [...sessions].reverse() : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{copy.sub}</p>
      </div>

      <form action="/history" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={copy.searchPlaceholder}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {locale === "id" ? "Cari" : "Search"}
        </button>
        {query && (
          <Link
            href="/history"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {copy.clearLabel}
          </Link>
        )}
      </form>

      {msgs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {query ? copy.emptySearch : copy.empty}
          </CardContent>
        </Card>
      ) : useFlat ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {msgs.length} {locale === "id" ? "hasil" : "results"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {msgs.map((m) => (
                <SearchResult
                  key={m.id}
                  msg={m}
                  query={query}
                  youLabel={copy.youLabel}
                  aiLabel={copy.aiLabel}
                  locale={locale}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {sortedSessions!.map((session, idx) => (
            <Card key={idx}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>
                  {formatSessionLabel(session[0].created_at, locale)}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {session.length} {copy.messagesLabel}
                  </span>
                  <ResumeButton
                    session={session}
                    label={copy.resumeLabel}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {session.map((m) => (
                    <MessageBubble
                      key={m.id}
                      msg={m}
                      youLabel={copy.youLabel}
                      aiLabel={copy.aiLabel}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumeButton({
  session,
  label,
}: {
  session: Msg[];
  label: string;
}) {
  const pivot = session[0];
  if (!pivot) return null;
  return (
    <Link
      href={`/dashboard?resume=${pivot.id}`}
      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
    >
      {label}
    </Link>
  );
}

function MessageBubble({
  msg,
  youLabel,
  aiLabel,
}: {
  msg: Msg;
  youLabel: string;
  aiLabel: string;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-indigo-600 px-4 py-2 text-sm text-white">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
            {youLabel}
          </p>
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2 text-slate-900">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {aiLabel}
        </p>
        <Markdown>{msg.content}</Markdown>
      </div>
    </div>
  );
}

function SearchResult({
  msg,
  query,
  youLabel,
  aiLabel,
  locale,
}: {
  msg: Msg;
  query: string;
  youLabel: string;
  aiLabel: string;
  locale: "en" | "id";
}) {
  const snippet = highlight(msg.content, query);
  const label = msg.role === "user" ? youLabel : aiLabel;
  const time = formatSessionLabel(msg.created_at, locale);
  return (
    <div className="rounded-lg border border-slate-100 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="text-[10px] text-slate-400">{time}</span>
      </div>
      <p
        className="text-slate-800"
        dangerouslySetInnerHTML={{ __html: snippet }}
      />
    </div>
  );
}

function highlight(content: string, query: string): string {
  const safe = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const re = new RegExp(`(${escapeRegex(query)})`, "gi");
  return safe.replace(
    re,
    "<mark style='background:#fef08a;padding:0 2px;border-radius:2px'>$1</mark>",
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function groupIntoSessions(msgs: Msg[]): Msg[][] {
  if (msgs.length === 0) return [];
  const sessions: Msg[][] = [[msgs[0]]];
  const GAP_MS = 30 * 60 * 1000;
  for (let i = 1; i < msgs.length; i++) {
    const prev = new Date(
      sessions[sessions.length - 1].at(-1)!.created_at,
    ).getTime();
    const curr = new Date(msgs[i].created_at).getTime();
    if (curr - prev <= GAP_MS) {
      sessions[sessions.length - 1].push(msgs[i]);
    } else {
      sessions.push([msgs[i]]);
    }
  }
  return sessions;
}

function formatSessionLabel(iso: string, locale: "en" | "id"): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const time = d.toLocaleTimeString(locale === "id" ? "id-ID" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  if (sameDay) return `${locale === "id" ? "Hari ini" : "Today"} · ${time}`;
  if (isYesterday) return `${locale === "id" ? "Kemarin" : "Yesterday"} · ${time}`;

  const dateStr = d.toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    timeZone: "Asia/Jakarta",
  });
  return `${dateStr} · ${time}`;
}
