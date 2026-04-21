"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useState } from "react";

function ChatImage({ src, alt }: { src: string; alt?: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `sigap-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(src, "_blank");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="my-2 inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className="block max-w-full rounded-lg border border-slate-200"
      />
      <span className="mt-1 flex gap-2 text-xs">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-md bg-slate-900 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Downloading…" : "Download"}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          Open
        </a>
      </span>
    </span>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            return isBlock ? (
              <code className="block overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">
                {children}
              </code>
            ) : (
              <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs">
                {children}
              </code>
            );
          },
          a: ({ children, href }) => {
            const isInternal =
              typeof href === "string" && href.startsWith("/");
            if (isInternal) {
              return (
                <Link
                  href={href}
                  className="text-indigo-600 underline hover:text-indigo-500"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline hover:text-indigo-500"
              >
                {children}
              </a>
            );
          },
          h1: ({ children }) => (
            <h1 className="mb-2 text-base font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-sm font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 text-sm font-semibold">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 pl-3 italic text-slate-600">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-slate-200" />,
          img: ({ src, alt }) =>
            typeof src === "string" ? <ChatImage src={src} alt={alt} /> : null,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 px-2 py-1">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
