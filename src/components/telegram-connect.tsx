"use client";

import { useState } from "react";

const BOT_USERNAME = "coworkflo_bot";

type Props = {
  initialLinked: { username: string | null } | null;
  initialCode: { code: string; expires_at: string } | null;
};

export function TelegramConnect({ initialLinked, initialCode }: Props) {
  const [linked, setLinked] = useState(initialLinked);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(
    initialCode && new Date(initialCode.expires_at) > new Date() ? initialCode : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/generate-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCode(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate code");
    } finally {
      setLoading(false);
    }
  }

  async function unlink() {
    setLoading(true);
    try {
      await fetch("/api/telegram/unlink", { method: "POST" });
      setLinked(null);
      setCode(null);
    } finally {
      setLoading(false);
    }
  }

  if (linked) {
    return (
      <div>
        <p className="text-sm text-slate-700">
          ✅ Linked to{" "}
          <strong>{linked.username ? `@${linked.username}` : "Telegram"}</strong>. You can chat with Cowork directly on Telegram.
        </p>
        <button
          onClick={unlink}
          disabled={loading}
          className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "…" : "Unlink Telegram"}
        </button>
      </div>
    );
  }

  if (code) {
    const deepLink = `https://t.me/${BOT_USERNAME}?start=${code.code}`;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-700 mb-2">Your linking code:</p>
          <div className="flex items-center gap-4">
            <code className="rounded-lg bg-slate-900 px-4 py-2 text-2xl font-bold tracking-wider text-white">
              {code.code}
            </code>
            <span className="text-xs text-slate-500">expires in 10 min</span>
          </div>
        </div>

        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1d8ec2]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          Open in Telegram
        </a>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Click the button above (or search <strong>@{BOT_USERNAME}</strong> in Telegram)</li>
          <li>
            Tap <strong>Start</strong>, or reply with{" "}
            <code className="rounded bg-slate-100 px-1">/start {code.code}</code>
          </li>
          <li>The bot will confirm: &quot;Linked! ✅&quot;</li>
        </ol>

        <button
          onClick={generateCode}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-slate-900 underline"
        >
          Generate a new code
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Chat with your Cowork AI directly from Telegram. Ask about your schedule, add tasks, or get briefings — all from your phone.
      </p>
      <button
        onClick={generateCode}
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Generating…" : "Get linking code"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
