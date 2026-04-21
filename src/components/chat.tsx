"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "./markdown";
import type { Dict } from "@/lib/i18n/dictionaries";

type Msg = { role: "user" | "assistant"; content: string };
type T = Dict["chat"];

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
    const newMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          ...(agentSlug ? { agent_slug: agentSlug } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setError(err.error || "Something went wrong");
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
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white whitespace-pre-wrap"
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
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
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
