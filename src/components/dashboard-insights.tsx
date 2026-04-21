import { Card } from "@/components/ui/card";
import Link from "next/link";

type Pill = {
  label: string;
  value: number | string;
  href?: string;
  tone?: "default" | "warning" | "indigo" | "emerald";
};

const TONE: Record<NonNullable<Pill["tone"]>, string> = {
  default: "bg-white border-slate-200",
  warning: "bg-amber-50 border-amber-200",
  indigo: "bg-indigo-50 border-indigo-200",
  emerald: "bg-emerald-50 border-emerald-200",
};

export function DashboardInsights({ pills }: { pills: Pill[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {pills.map((p) => {
        const body = (
          <Card
            className={`flex flex-col gap-1 border p-3 ${TONE[p.tone ?? "default"]} ${p.href ? "cursor-pointer transition hover:shadow-md" : ""}`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {p.label}
            </span>
            <span className="text-2xl font-bold text-slate-900">{p.value}</span>
          </Card>
        );
        return p.href ? (
          <Link key={p.label} href={p.href}>
            {body}
          </Link>
        ) : (
          <div key={p.label}>{body}</div>
        );
      })}
    </div>
  );
}
