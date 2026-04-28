import Link from "next/link";

type Pill = {
  label: string;
  value: number | string;
  href?: string;
  /**
   * Two states only (per audit 2b): neutral = quiet stat, attention =
   * something the user should look at. Old indigo/emerald accents
   * dropped — those colors are reserved for primary CTA/brand and
   * shouldn't decorate stats.
   */
  tone?: "default" | "warning" | "indigo" | "emerald";
};

const TONE = {
  // Neutral pill — the default. Quiet, doesn't compete with the chat.
  default: "bg-slate-50 text-slate-600",
  warning: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  // Both indigo + emerald collapse to neutral now (no more 5 colors fighting).
  indigo: "bg-slate-50 text-slate-600",
  emerald: "bg-slate-50 text-slate-600",
} as const;

export function DashboardInsights({ pills }: { pills: Pill[] }) {
  // Compact horizontal strip instead of card grid — pills stop competing
  // with the hero chat for visual attention.
  const visible = pills.filter((p) => {
    // Hide pills with 0 value unless they're warning-toned (those mean
    // something even at zero, e.g. 0 events = clean day signal).
    if (typeof p.value === "number" && p.value === 0 && p.tone !== "warning") {
      return false;
    }
    return true;
  });

  if (visible.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
      {visible.map((p) => {
        const tone = TONE[p.tone ?? "default"];
        const inner = (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${tone}`}
          >
            <span className="font-semibold tabular-nums">{p.value}</span>
            <span>{p.label}</span>
          </span>
        );
        return p.href ? (
          <Link key={p.label} href={p.href} className="hover:opacity-80">
            {inner}
          </Link>
        ) : (
          <span key={p.label}>{inner}</span>
        );
      })}
    </div>
  );
}
