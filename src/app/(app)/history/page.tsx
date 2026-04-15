import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getDict } from "@/lib/i18n";

type Msg = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
};

export default async function HistoryPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const dict = await getDict();

  const sb = supabaseAdmin();
  const { data: messages } = await sb
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  const msgs = (messages ?? []) as Msg[];

  // Group messages into sessions: a session is a contiguous run of
  // messages within 30 minutes of each other, displayed newest first.
  const sessions = groupIntoSessions(msgs.reverse());
  const sortedSessions = [...sessions].reverse();

  const locale = dict.nav.dashboard === "Dasbor" ? "id" : "en";
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
    youLabel: locale === "id" ? "Anda" : "You",
    aiLabel: "Sigap",
    messagesLabel: locale === "id" ? "pesan" : "messages",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{copy.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{copy.sub}</p>
      </div>

      {sortedSessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {copy.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {sortedSessions.map((session, idx) => (
            <Card key={idx}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>{formatSessionLabel(session[0].created_at, locale)}</CardTitle>
                <span className="text-xs text-slate-500">
                  {session.length} {copy.messagesLabel}
                </span>
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
      <div className="max-w-[75%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-900">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {aiLabel}
        </p>
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function groupIntoSessions(msgs: Msg[]): Msg[][] {
  if (msgs.length === 0) return [];
  const sessions: Msg[][] = [[msgs[0]]];
  const GAP_MS = 30 * 60 * 1000;
  for (let i = 1; i < msgs.length; i++) {
    const prev = new Date(sessions[sessions.length - 1].at(-1)!.created_at).getTime();
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
