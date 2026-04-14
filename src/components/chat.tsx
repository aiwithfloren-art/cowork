"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's my top priority today?",
  "What meetings do I have this week?",
  "Add a task: review proposal",
];

export function Chat() {
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
    setMessages(newMessages);
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
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.text || "(empty)" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {messages.length === 0 && !error && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-4 text-sm text-slate-500">
              Ask your Chief of Staff anything.
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-6 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
                  : "mr-6 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900"
              }
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="mr-6 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
              Thinking…
            </div>
          )}
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
            placeholder="Ask anything…"
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
