"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Collapsible "Today" drawer placed above the hero chat. Shows a thin
 * one-line summary by default (today's event count + open tasks) and
 * expands to the full event/task lists when clicked. Replaces the old
 * 2/3-width side panel of cards so the chat can take the full reading
 * column.
 */
export function TodayDrawer({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left text-sm transition hover:bg-slate-100"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-slate-700">
          <span aria-hidden>📅</span>
          <span className="font-medium">{summary}</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide ▴" : "Show ▾"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200/60 px-4 py-4">{children}</div>
      )}
    </div>
  );
}
