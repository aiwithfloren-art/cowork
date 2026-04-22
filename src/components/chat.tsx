"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "./markdown";
import type { Dict } from "@/lib/i18n/dictionaries";

type Msg = {
  role: "user" | "assistant";
  content: string;
  // Set on assistant messages when the chat was routed to a specific
  // AI employee via @mention, so we can label the bubble.
  agent?: { slug: string; name: string; emoji: string };
};
type T = Dict["chat"];
type MyAgent = { slug: string; name: string; emoji: string; description: string };

// Parses "@amore rest of message" → { slug: "amore", rest: "rest of message" }.
// Slug matches agent slugs we allow: lowercase alnum + dash. Returns null if
// the message doesn't start with a valid @mention.
function parseMention(text: string): { slug: string; rest: string } | null {
  const trimmed = text.trimStart();
  // Match `@slug <rest>` — slug is lowercase alnum + dash, rest is anything
  // up to end of string (including newlines, via [\s\S]).
  const m = trimmed.match(/^@([a-z0-9][a-z0-9-]{0,50})\s+([\s\S]+)$/i);
  if (!m) return null;
  return { slug: m[1].toLowerCase(), rest: m[2].trim() };
}

// Keywords in the user's message that suggest the AI will mutate
// calendar/tasks state — when the response finishes we trigger a
// router.refresh() so server components re-fetch fresh Google data.
const MUTATION_KEYWORDS = [
  "add",
  "create",
  "schedule",
  "book",
  "tambah",
  "buat",
  "bikin",
  "complete",
  "done",
  "selesai",
  "delete",
  "remove",
  "hapus",
  "move",
  "reschedule",
  "geser",
  "ubah",
];

function looksMutating(text: string): boolean {
  const lower = text.toLowerCase();
  return MUTATION_KEYWORDS.some((kw) => lower.includes(kw));
}

export function Chat({
  t,
  initialPrompt = "",
  resumeId,
  agentSlug,
}: {
  t: T;
  initialPrompt?: string;
  resumeId?: string;
  agentSlug?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitResetAt, setRateLimitResetAt] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (initialPrompt && inputRef.current) {
      inputRef.current.focus();
    }
  }, [initialPrompt]);

  // Pull any prefilled prompt stashed by /agents templates, etc.
  useEffect(() => {
    if (agentSlug) return; // only for main Sigap
    try {
      const pending = sessionStorage.getItem("agent_template_prompt");
      if (pending) {
        sessionStorage.removeItem("agent_template_prompt");
        setInput(pending);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch {}
  }, [agentSlug]);

  // Load user's activated AI employees for @mention autocomplete + send-
  // time routing. Scoped to main chat only — inside a sub-agent thread we
  // stay focused on that agent and don't do cross-routing.
  useEffect(() => {
    if (agentSlug) return;
    (async () => {
      try {
        const res = await fetch("/api/agents/mine");
        if (!res.ok) return;
        const data = (await res.json()) as { agents?: MyAgent[] };
        if (Array.isArray(data.agents)) setMyAgents(data.agents);
      } catch {}
    })();
  }, [agentSlug]);

  // Track @mention in progress — detect "@partial" as last token while user
  // types, show dropdown with matching activated agents.
  function handleInputChange(value: string) {
    setInput(value);
    if (agentSlug) return; // @mention UX disabled inside sub-agent threads
    const m = value.match(/(?:^|\s)@([a-z0-9-]*)$/i);
    if (m) {
      setMentionQuery(m[1].toLowerCase());
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }

  function selectMention(slug: string) {
    // Replace the in-progress "@partial" with "@slug " at the end.
    const updated = input.replace(/(?:^|\s)@([a-z0-9-]*)$/i, (match) => {
      const hasLeadingSpace = match.startsWith(" ");
      return `${hasLeadingSpace ? " " : ""}@${slug} `;
    });
    setInput(updated);
    setMentionOpen(false);
    setTimeout(() => inputRef.current?.focus(), 10);
  }

  const filteredMentions = myAgents
    .filter((a) =>
      a.slug.startsWith(mentionQuery) ||
      a.name.toLowerCase().includes(mentionQuery),
    )
    .slice(0, 6);

  // Load prior session messages — explicit resumeId from /history, or on
  // fresh dashboard mount, the latest session (so navigating away and back
  // doesn't blank the conversation).
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (resumeId) params.set("pivot", resumeId);
        else params.set("latest", "true");
        if (agentSlug) params.set("agent", agentSlug);
        const res = await fetch(`/api/chat/session?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: Msg[] };
        if (Array.isArray(data.messages) && data.messages.length) {
          setMessages(data.messages);
        }
      } catch {}
    })();
  }, [resumeId, agentSlug]);

  // Keyboard shortcut: Cmd/Ctrl+K or / focuses the chat input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const isSlash = e.key === "/" && !inInput;
      if (isCmdK || isSlash) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Voice input via Web Speech API
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SR) {
      setSpeechSupported(true);
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (ev: any) => {
        const text = Array.from(ev.results as ArrayLike<{ 0: { transcript: string } }>)
          .map((r) => r[0].transcript)
          .join(" ");
        setInput(text);
      };
      rec.onend = () => setListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (_e: any) => setListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setInput("");
      recognitionRef.current.start();
      setListening(true);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    // @mention routing — if main chat user starts with @<slug>, route to
    // that AI employee's chat endpoint instead of main Sigap. We keep the
    // full original text (with @mention) in the displayed bubble so the
    // user sees what they typed, but strip the mention before sending to
    // the agent so its system prompt doesn't get confused by the prefix.
    let routedAgentSlug = agentSlug;
    let routedAgent: Msg["agent"] | undefined;
    let serverText = text;
    if (!agentSlug) {
      const parsed = parseMention(text);
      if (parsed) {
        const match = myAgents.find((a) => a.slug === parsed.slug);
        if (match) {
          routedAgentSlug = match.slug;
          routedAgent = {
            slug: match.slug,
            name: match.name,
            emoji: match.emoji,
          };
          serverText = parsed.rest;
        }
      }
    }

    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    const serverMessages: Msg[] = [
      ...messages,
      { role: "user", content: serverText },
    ];
    setMessages([
      ...newMessages,
      { role: "assistant", content: "", agent: routedAgent },
    ]);
    setInput("");
    setMentionOpen(false);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: serverMessages,
          ...(routedAgentSlug ? { agent_slug: routedAgentSlug } : {}),
        }),
      });

      if (!res.ok) {
        // Try JSON first (our own error shape), fall back to text preview so
        // a Vercel 504 HTML page or bare stack trace still surfaces useful
        // info instead of a generic "Request failed".
        const raw = await res.text().catch(() => "");
        let err: { error?: string; resetsAt?: string | null } = {};
        try {
          err = raw ? JSON.parse(raw) : {};
        } catch {
          const preview = raw
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);
          err = {
            error: `${res.status} ${res.statusText}${preview ? ` — ${preview}` : ""}`,
          };
        }
        console.error("[chat] request failed", {
          status: res.status,
          statusText: res.statusText,
          body: raw.slice(0, 500),
        });
        setError(err.error || `Request failed (${res.status})`);
        if (err.resetsAt) setRateLimitResetAt(err.resetsAt);
        setMessages(newMessages);
        setLoading(false);
        return;
      }

      setRateLimitResetAt(null);

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Streaming not supported");
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setMessages((msgs) => {
          const copy = [...msgs];
          copy[copy.length - 1] = { role: "assistant", content: accumulated };
          return copy;
        });
      }

      if (!accumulated.trim()) {
        setMessages((msgs) => {
          const copy = [...msgs];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "(No response — try rephrasing)",
          };
          return copy;
        });
      }

      // Auto-refresh dashboard server components if the user message
      // looks like a mutation (add event, complete task, etc.)
      if (looksMutating(text)) {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-slate-100 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Expand to fullscreen"}
          aria-label={fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          {fullscreen ? "✕" : "⛶"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {messages.length === 0 && !error && (
          agentSlug ? (
            <div className="space-y-4 py-2">
              <p className="text-center text-sm text-slate-500">
                Mulai ngobrol — agent siap kerja.
              </p>
              <div className="mx-auto flex max-w-md flex-col gap-2">
                <SuggestionChip onClick={() => send("Halo, kamu bisa bantu apa aja?")}>
                  Halo, kamu bisa bantu apa aja?
                </SuggestionChip>
                <SuggestionChip onClick={() => send("Apa tool yang kamu punya?")}>
                  Apa tool yang kamu punya?
                </SuggestionChip>
                <SuggestionChip onClick={() => send("Kasih aku ide apa yang bisa kita kerjain sekarang")}>
                  Kasih aku ide apa yang bisa kita kerjain sekarang
                </SuggestionChip>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-center text-sm text-slate-500">{t.askPrompt}</p>

              <SuggestionGroup title={t.suggestions.briefingTitle}>
                <SuggestionChip onClick={() => send(t.suggestions.briefing1)}>
                  {t.suggestions.briefing1}
                </SuggestionChip>
                <SuggestionChip onClick={() => send(t.suggestions.briefing2)}>
                  {t.suggestions.briefing2}
                </SuggestionChip>
              </SuggestionGroup>

              <SuggestionGroup title={t.suggestions.actionTitle}>
                <SuggestionChip onClick={() => send(t.suggestions.action1)}>
                  {t.suggestions.action1}
                </SuggestionChip>
                <SuggestionChip onClick={() => send(t.suggestions.action2)}>
                  {t.suggestions.action2}
                </SuggestionChip>
              </SuggestionGroup>

              <SuggestionGroup title={t.suggestions.insightTitle}>
                <SuggestionChip onClick={() => send(t.suggestions.insight1)}>
                  {t.suggestions.insight1}
                </SuggestionChip>
                <SuggestionChip onClick={() => send(t.suggestions.insight2)}>
                  {t.suggestions.insight2}
                </SuggestionChip>
              </SuggestionGroup>
            </div>
          )
        )}
        <div className="space-y-3">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const isStreaming = loading && isLast && m.role === "assistant";
            return (
              <div key={i} className="space-y-1">
                {m.role === "assistant" && m.agent && (
                  <p className="ml-1 text-[11px] font-medium text-indigo-700">
                    {m.agent.emoji} @{m.agent.slug}{" "}
                    <span className="font-normal text-slate-500">
                      · {m.agent.name}
                    </span>
                  </p>
                )}
                <div
                  className={
                    m.role === "user"
                      ? "ml-6 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white whitespace-pre-wrap"
                      : m.agent
                        ? "mr-6 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-slate-900"
                        : "mr-6 rounded-lg bg-slate-100 px-3 py-2 text-slate-900"
                  }
                >
                  {m.role === "assistant" && m.content ? (
                    <Markdown>{m.content}</Markdown>
                  ) : (
                    m.content || (isStreaming ? "…" : "")
                  )}
                  {isStreaming && m.content && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />
                  )}
                </div>
              </div>
            );
          })}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <p>{error}</p>
              {rateLimitResetAt && (
                <p className="mt-1 text-[11px] text-red-600">
                  Resets {timeFromNow(rateLimitResetAt)} ·{" "}
                  <a href="/settings" className="underline">
                    Add your own key →
                  </a>
                </p>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-slate-200 p-3 bg-white"
      >
        <div className="relative flex items-end gap-2">
          {mentionOpen && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 right-14 mb-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Your AI employees — pick one to @mention
              </p>
              {filteredMentions.map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(a.slug);
                  }}
                  className="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                >
                  <span className="text-lg">{a.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      @{a.slug}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        {a.name}
                      </span>
                    </p>
                    {a.description && (
                      <p className="truncate text-xs text-slate-500">
                        {a.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              handleInputChange(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && mentionOpen) {
                setMentionOpen(false);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={listening ? "Listening…" : t.askAnything}
            disabled={loading}
            className="flex-1 resize-none overflow-y-auto rounded-lg border border-slate-200 px-3 py-2 text-sm leading-5 focus:border-indigo-500 focus:outline-none"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={loading}
              title="Voice input"
              className={
                listening
                  ? "rounded-lg bg-red-500 px-3 text-white hover:bg-red-400"
                  : "rounded-lg border border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50"
              }
            >
              {listening ? "⏹" : "🎤"}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {t.send}
          </button>
        </div>
      </form>
    </div>
  );

  if (!fullscreen) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 backdrop-blur-sm">
      <div
        className="my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl mx-4"
        role="dialog"
        aria-modal="true"
        aria-label="Chief of Staff — fullscreen chat"
      >
        {body}
      </div>
    </div>
  );
}

function timeFromNow(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function SuggestionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SuggestionChip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
    >
      {children}
    </button>
  );
}
