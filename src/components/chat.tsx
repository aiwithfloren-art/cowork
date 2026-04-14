"use client";

import { useState, useRef, useEffect } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";

type Msg = { role: "user" | "assistant"; content: string };
type T = Dict["chat"];

export function Chat({ t }: { t: T }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setError(err.error || "Something went wrong");
        setMessages(newMessages);
        setLoading(false);
        return;
      }

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {messages.length === 0 && !error && (
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
                    ? "ml-6 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
                    : "mr-6 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap"
                }
              >
                {m.content || (isStreaming ? "…" : "")}
                {isStreaming && m.content && (
                  <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />
                )}
              </div>
            );
          })}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
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
        className="border-t border-slate-200 p-3"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.askAnything}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
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
