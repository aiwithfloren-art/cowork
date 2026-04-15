"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LanguageToggle } from "./language-toggle";

type NavItem = { href: string; label: string };

type Props = {
  items: NavItem[];
  locale: "en" | "id";
  user: { name?: string | null; email?: string | null; image?: string | null };
  signOutLabel: string;
  onSignOut: () => Promise<void>;
};

export function AppNav({ items, locale, user, signOutLabel, onSignOut }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-indigo-600 to-cyan-400" />
            Sigap
          </Link>
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "text-slate-900 font-medium"
                      : "text-slate-600 hover:text-slate-900"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <LanguageToggle locale={locale} />
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            {user.image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
            )}
            <span className="text-xs text-slate-600">{user.name}</span>
            <form action={onSignOut}>
              <button type="submit" className="text-xs text-slate-500 hover:text-slate-900">
                {signOutLabel}
              </button>
            </form>
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-2 text-slate-700 md:hidden"
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6L18 18 M6 18L18 6" />
            ) : (
              <path d="M4 6h16 M4 12h16 M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-slate-200 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    active
                      ? "rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
                      : "rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <LanguageToggle locale={locale} />
            <form action={onSignOut}>
              <button
                type="submit"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                {signOutLabel}
              </button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
