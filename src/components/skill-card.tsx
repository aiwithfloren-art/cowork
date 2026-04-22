"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type Skill = {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  enabled_tools: string[];
  install_count: number | null;
  published_by_name: string | null;
  installed_slug: string | null;
  visibility?: "all" | "manager_only" | "owner_only";
  auto_deploy?: boolean;
};

export function SkillCard({
  skill,
  canManage,
  t,
}: {
  skill: Skill;
  canManage: boolean;
  t: {
    publishedBy: string;
    installs: string;
    install: string;
    installing: string;
    installed: string;
    openAgent: string;
    remove: string;
    removing: string;
    confirmRemove: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"install" | "remove" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  async function install() {
    setBusy("install");
    setError(null);
    try {
      const res = await fetch(
        `/api/team/skills/${encodeURIComponent(skill.id)}/install`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(null);
    }
  }

  async function copyShareLink() {
    setBusy("share");
    setError(null);
    try {
      const res = await fetch(
        `/api/team/skills/${encodeURIComponent(skill.id)}/share-link`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      const url = `${window.location.origin}/install/${data.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        // Clipboard blocked — fall back to prompt
        window.prompt("Copy this link:", url);
      }
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(t.confirmRemove.replace("{name}", skill.name))) return;
    setBusy("remove");
    setError(null);
    try {
      const res = await fetch(
        `/api/team/skills/${encodeURIComponent(skill.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{skill.emoji ?? "🤖"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {skill.name}
            </h3>
            {skill.installed_slug && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                {t.installed}
              </span>
            )}
            {skill.auto_deploy && (
              <span
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                title="Auto-deployed to all new members"
              >
                🚀 auto
              </span>
            )}
            {skill.visibility === "manager_only" && (
              <span
                className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                title="Only visible to managers and owner"
              >
                🔒 managers
              </span>
            )}
            {skill.visibility === "owner_only" && (
              <span
                className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                title="Only visible to owner"
              >
                🔒 owner
              </span>
            )}
          </div>
          {skill.description && (
            <p className="mt-1 text-sm text-slate-600">{skill.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {skill.published_by_name && (
              <span>
                {t.publishedBy}{" "}
                <span className="font-medium text-slate-700">
                  {skill.published_by_name}
                </span>
              </span>
            )}
            <span>
              {skill.install_count ?? 0} {t.installs}
            </span>
            <span>
              {skill.enabled_tools.length} tools
            </span>
          </div>
          {skill.enabled_tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skill.enabled_tools.slice(0, 6).map((tool) => (
                <span
                  key={tool}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] text-indigo-700"
                >
                  {tool}
                </span>
              ))}
              {skill.enabled_tools.length > 6 && (
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                  +{skill.enabled_tools.length - 6}
                </span>
              )}
            </div>
          )}
          {error && (
            <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {skill.installed_slug ? (
              <Link
                href={`/agents/${skill.installed_slug}`}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                {t.openAgent}
              </Link>
            ) : (
              <button
                onClick={install}
                disabled={busy !== null}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy === "install" ? t.installing : `⬇ ${t.install}`}
              </button>
            )}
            <button
              onClick={copyShareLink}
              disabled={busy !== null}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Share this employee with anyone (no signup needed by them beyond Google OAuth)"
            >
              {busy === "share"
                ? "…"
                : shareCopied
                  ? "✓ Link copied"
                  : "📎 Share link"}
            </button>
            {canManage && (
              <button
                onClick={remove}
                disabled={busy !== null}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {busy === "remove" ? t.removing : `🗑 ${t.remove}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
