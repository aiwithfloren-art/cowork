"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: null, label: "All", emoji: "✨" },
  { slug: "post", label: "Posts", emoji: "📱" },
  { slug: "caption", label: "Captions", emoji: "✍️" },
  { slug: "email", label: "Emails", emoji: "✉️" },
  { slug: "proposal", label: "Proposals", emoji: "📄" },
  { slug: "document", label: "Docs", emoji: "📋" },
];

export function ArtifactsFilter({ current }: { current: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = (t.slug ?? null) === current;
        const href = t.slug ? `/artifacts?type=${t.slug}` : "/artifacts";
        return (
          <Link
            key={t.label}
            href={href}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition",
              active
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
