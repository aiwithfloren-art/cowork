"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "+ Create new" dropdown for the Agents hub. Two paths:
 *   - Chat to create  → /dashboard with a query param so the chat composer
 *     pre-fills a placeholder ("Bikin agent buat ___"). The dashboard chat
 *     reads this and seeds the input — admin types the role, AI handles the
 *     rest via create_ai_employee tool.
 *   - Browse templates → scroll to / open the starter template gallery.
 *     For now this jumps to /dashboard and seeds a different placeholder
 *     suggesting the install_skill flow. (We can swap to a modal later.)
 */
export function CreateAgentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function chatToCreate() {
    setOpen(false);
    router.push(
      `/dashboard?seed=${encodeURIComponent("Bikin AI agent buat ")}`,
    );
  }

  function browseTemplates() {
    setOpen(false);
    router.push(
      `/dashboard?seed=${encodeURIComponent("List skill yang bisa diinstall")}`,
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        + Create new
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            onClick={chatToCreate}
            className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-50"
          >
            <span className="text-xl">💬</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                Chat to create
              </p>
              <p className="text-xs text-slate-500">
                Cerita ke Sigap apa role agent-nya — AI bikinin sendiri.
              </p>
            </div>
          </button>
          <button
            onClick={browseTemplates}
            className="flex w-full items-start gap-3 border-t border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
          >
            <span className="text-xl">📋</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                Browse templates
              </p>
              <p className="text-xs text-slate-500">
                Pakai starter (Lead Gen, Content Creator, Coder).
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
