"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";

export type ArtifactRow = {
  id: string;
  type: "post" | "caption" | "email" | "proposal" | "document";
  platform: string | null;
  title: string;
  body_markdown: string;
  meta: {
    subject?: string;
    recipient?: string;
    hashtags?: string[];
    cta?: string;
    client?: string;
  };
  status: string;
  created_at: string;
  updated_at: string;
};

const TYPE_EMOJI: Record<string, string> = {
  post: "📱",
  caption: "✍️",
  email: "✉️",
  proposal: "📄",
  document: "📋",
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  tiktok: "TikTok",
  email: "Email",
};

export function ArtifactViewer({ artifact }: { artifact: ArtifactRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(artifact.title);
  const [body, setBody] = useState(artifact.body_markdown);
  const [pending, startTransition] = useTransition();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeEmoji = TYPE_EMOJI[artifact.type] ?? "📄";
  const platformLabel = artifact.platform ? PLATFORM_LABEL[artifact.platform] : null;

  function buildCopyText(): string {
    const parts: string[] = [];
    if (artifact.type === "email") {
      if (artifact.meta.subject) parts.push(`Subject: ${artifact.meta.subject}`);
      parts.push("");
    }
    parts.push(body);
    if (artifact.meta.hashtags && artifact.meta.hashtags.length > 0) {
      parts.push("", artifact.meta.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
    }
    if (artifact.meta.cta) {
      parts.push("", artifact.meta.cta);
    }
    return parts.join("\n");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }

  async function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/artifacts/${artifact.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body_markdown: body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Save failed" }));
        setError(j.error ?? "Save failed");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  async function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/artifacts/${artifact.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Delete failed" }));
        setError(j.error ?? "Delete failed");
        return;
      }
      router.push("/artifacts");
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="text-3xl leading-none">{typeEmoji}</span>
          <div className="min-w-0">
            {editing ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xl font-bold focus:border-indigo-500 focus:outline-none"
              />
            ) : (
              <h1 className="truncate text-xl font-bold text-slate-900">
                {artifact.title}
              </h1>
            )}
            <p className="mt-1 text-xs text-slate-500">
              <span className="capitalize">{artifact.type}</span>
              {platformLabel && <> · {platformLabel}</>}
            </p>
          </div>
        </div>
      </div>

      {/* Preview card — type-specific rendering */}
      <ArtifactPreview artifact={{ ...artifact, title, body_markdown: body }} editing={editing} onBodyChange={setBody} />

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(artifact.title);
                setBody(artifact.body_markdown);
                setEditing(false);
              }}
              disabled={pending}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              {copyStatus === "copied"
                ? "✓ Tersalin"
                : copyStatus === "error"
                  ? "Gagal copy"
                  : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            {deleteConfirm ? (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {pending ? "Menghapus…" : "Yakin hapus?"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Hapus
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ArtifactPreview({
  artifact,
  editing,
  onBodyChange,
}: {
  artifact: ArtifactRow;
  editing: boolean;
  onBodyChange: (v: string) => void;
}) {
  if (editing) {
    return (
      <Card>
        <CardContent className="p-4">
          <textarea
            value={artifact.body_markdown}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={18}
            className="w-full resize-y rounded-md border border-slate-300 p-3 text-sm font-mono focus:border-indigo-500 focus:outline-none"
            placeholder="Tulis body markdown…"
          />
        </CardContent>
      </Card>
    );
  }

  if (artifact.type === "email") {
    return <EmailPreview artifact={artifact} />;
  }
  if (artifact.type === "post" || artifact.type === "caption") {
    return <PostPreview artifact={artifact} />;
  }
  if (artifact.type === "proposal") {
    return <ProposalPreview artifact={artifact} />;
  }
  return <GenericPreview artifact={artifact} />;
}

function EmailPreview({ artifact }: { artifact: ArtifactRow }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {artifact.meta.recipient ? `Kepada: ${artifact.meta.recipient}` : "Email draft"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {artifact.meta.subject ?? "(no subject)"}
          </p>
        </div>
        <div className="px-5 py-4">
          <Markdown>{artifact.body_markdown}</Markdown>
        </div>
      </CardContent>
    </Card>
  );
}

function PostPreview({ artifact }: { artifact: ArtifactRow }) {
  const bgByPlatform: Record<string, string> = {
    instagram: "bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50",
    linkedin: "bg-gradient-to-br from-blue-50 to-slate-50",
    twitter: "bg-slate-50",
    whatsapp: "bg-emerald-50",
    facebook: "bg-blue-50",
    tiktok: "bg-slate-900 text-slate-50",
  };
  const bg =
    (artifact.platform && bgByPlatform[artifact.platform]) ?? "bg-slate-50";
  const isDark = artifact.platform === "tiktok";

  return (
    <Card>
      <CardContent className="p-0">
        <div className={`rounded-t-xl ${bg} px-5 py-8`}>
          <div
            className={`mx-auto max-w-md rounded-lg border ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"} p-5 shadow-sm`}
          >
            <Markdown>{artifact.body_markdown}</Markdown>
            {artifact.meta.hashtags && artifact.meta.hashtags.length > 0 && (
              <p className="mt-3 text-sm text-indigo-600">
                {artifact.meta.hashtags
                  .map((h) => `#${h.replace(/^#/, "")}`)
                  .join(" ")}
              </p>
            )}
            {artifact.meta.cta && (
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {artifact.meta.cta}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProposalPreview({ artifact }: { artifact: ArtifactRow }) {
  return (
    <Card>
      <CardContent className="p-0">
        {artifact.meta.client && (
          <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white px-5 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Client
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {artifact.meta.client}
            </p>
          </div>
        )}
        <div className="px-5 py-4">
          <Markdown>{artifact.body_markdown}</Markdown>
          {artifact.meta.cta && (
            <p className="mt-4 rounded-md bg-indigo-50 p-3 text-sm font-medium text-indigo-900">
              {artifact.meta.cta}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GenericPreview({ artifact }: { artifact: ArtifactRow }) {
  return (
    <Card>
      <CardContent className="p-5">
        <Markdown>{artifact.body_markdown}</Markdown>
      </CardContent>
    </Card>
  );
}
