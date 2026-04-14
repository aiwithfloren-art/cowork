"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LanguageToggle({ locale }: { locale: "en" | "id" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(locale);

  async function switchTo(next: "en" | "id") {
    if (next === current || pending) return;
    setCurrent(next);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white text-xs overflow-hidden">
      <button
        onClick={() => switchTo("en")}
        className={`px-2.5 py-1 ${current === "en" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
      >
        EN
      </button>
      <button
        onClick={() => switchTo("id")}
        className={`px-2.5 py-1 ${current === "id" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
      >
        ID
      </button>
    </div>
  );
}
