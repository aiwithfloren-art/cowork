"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shared horizontal nav for team sub-pages. Renders as a compact tab-like
 * row so moving between Members / Skill Hub / Shared Tools / Admin feels
 * like one cohesive section, not 4 separate pages.
 *
 * The Admin link only appears for owners — server wrapper passes
 * showAdmin based on membership role.
 */
export function TeamSubnav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();

  const items = [
    { href: "/team", label: "Members & profile", icon: "👥" },
    { href: "/team/skills", label: "Skill Hub", icon: "📚" },
    { href: "/team/connectors", label: "Shared tools", icon: "🔌" },
    ...(showAdmin
      ? [{ href: "/team/admin", label: "Admin", icon: "⚙️" }]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
      {items.map((item) => {
        // Active if exact match, OR on a deeper subpath (e.g.
        // /team/admin/employees/xyz still highlights Admin).
        const active =
          pathname === item.href ||
          (item.href !== "/team" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            }
          >
            <span className="mr-1">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
