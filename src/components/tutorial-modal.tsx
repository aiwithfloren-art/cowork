"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n/dictionaries";

type T = Dict["tutorial"];

export function TutorialModal({ t }: { t: T }) {
  const [open, setOpen] = useState(true);
  const [slide, setSlide] = useState(0);

  const slides = [
    { title: t.slide1Title, body: t.slide1Body, emoji: "🤖" },
    { title: t.slide2Title, body: t.slide2Body, emoji: "💡" },
    { title: t.slide3Title, body: t.slide3Body, emoji: "📱" },
    { title: t.slide4Title, body: t.slide4Body, emoji: "🧑‍💼" },
  ];

  async function finish() {
    setOpen(false);
    try {
      await fetch("/api/tutorial/complete", { method: "POST" });
    } catch {}
  }

  if (!open) return null;

  const isLast = slide === slides.length - 1;
  const current = slides[slide];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-6xl text-center">{current.emoji}</div>
        <h2 className="mt-6 text-center text-2xl font-bold text-slate-900">
          {current.title}
        </h2>
        <p className="mt-4 text-center text-slate-600 leading-relaxed">{current.body}</p>

        {/* Dots */}
        <div className="mt-8 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === slide ? "w-8 bg-indigo-600" : "w-2 bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            {t.skip}
          </button>
          <div className="flex gap-2">
            {slide > 0 && (
              <button
                onClick={() => setSlide(slide - 1)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
              >
                {t.back}
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setSlide(slide + 1))}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {isLast ? t.done : t.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
