"use client";

import { useEffect, useState } from "react";

type NoteType = "general" | "user" | "feedback" | "project" | "reference";
type Visibility = "private" | "team";
type Note = {
  id: string;
  content: string;
  type?: NoteType;
  visibility?: Visibility;
  author?: string;
  created_at: string;
};

const TYPE_STYLES: Record<NoteType, { label: string; cls: string }> = {
  user: { label: "user", cls: "bg-indigo-100 text-indigo-700" },
  feedback: { label: "feedback", cls: "bg-amber-100 text-amber-700" },
  project: { label: "project", cls: "bg-emerald-100 text-emerald-700" },
  reference: { label: "reference", cls: "bg-sky-100 text-sky-700" },
  general: { label: "general", cls: "bg-slate-100 text-slate-600" },
};

export function NotesPanel({ locale }: { locale: "en" | "id" }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<NoteType>("general");
  const [draftVisibility, setDraftVisibility] = useState<Visibility>("private");
  const [filter, setFilter] = useState<NoteType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const copy = {
    placeholder:
      locale === "id"
        ? "Tulis catatan… (Sigap AI bisa baca ini nanti)"
        : "Write a note… (Sigap AI can recall these later)",
    save: locale === "id" ? "Simpan" : "Save",
    empty: locale === "id" ? "Belum ada catatan." : "No notes yet.",
    loading: locale === "id" ? "Memuat…" : "Loading…",
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notes/list");
      const data = await res.json();
      setNotes(data.notes ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft,
          type: draftType,
          visibility: draftVisibility,
        }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        setNotes((prev) => [data.note, ...prev]);
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/notes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function saveEdit(id: string) {
    const content = editValue.trim();
    if (!content) {
      setEditingId(null);
      return;
    }
    const prev = notes;
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, content } : n)));
    setEditingId(null);
    try {
      const res = await fetch("/api/notes/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotes(prev);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={copy.placeholder}
          rows={3}
          disabled={saving}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as NoteType)}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="general">general</option>
            <option value="user">user (tentang kamu)</option>
            <option value="feedback">feedback (cara kerja)</option>
            <option value="project">project (proyek/metrik)</option>
            <option value="reference">reference (link/sistem)</option>
          </select>
          <select
            value={draftVisibility}
            onChange={(e) => setDraftVisibility(e.target.value as Visibility)}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"
          >
            <option value="private">🔒 private</option>
            <option value="team">👥 team (shared)</option>
          </select>
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "…" : copy.save}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2">
        {(["all", "user", "feedback", "project", "reference", "general"] as const).map(
          (t) => {
            const count =
              t === "all"
                ? notes.length
                : notes.filter((n) => (n.type ?? "general") === t).length;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={
                  "rounded-full px-3 py-1 text-xs transition " +
                  (filter === t
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {t} ({count})
              </button>
            );
          },
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">{copy.loading}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400">{copy.empty}</p>
      ) : (
        <ul className="space-y-2">
          {notes
            .filter((n) => filter === "all" || (n.type ?? "general") === filter)
            .map((n) => {
              const style = TYPE_STYLES[n.type ?? "general"];
              return (
                <li
                  key={n.id}
                  className="group rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    {editingId === n.id ? (
                      <textarea
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(n.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            saveEdit(n.id);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        rows={2}
                        className="flex-1 resize-y rounded border border-indigo-200 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    ) : (
                      <p
                        className="flex-1 whitespace-pre-wrap text-slate-900"
                        onDoubleClick={() => {
                          setEditingId(n.id);
                          setEditValue(n.content);
                        }}
                        title="Double-click to edit"
                      >
                        {n.content}
                      </p>
                    )}
                    <div className="flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(n.id);
                          setEditValue(n.content);
                        }}
                        className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        aria-label="Edit note"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => remove(n.id)}
                        className="rounded p-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete note"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.cls}`}
                    >
                      {style.label}
                    </span>
                    {n.visibility === "team" && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                        👥 team · {n.author ?? ""}
                      </span>
                    )}
                    <p className="text-[10px] text-slate-400">
                      {new Date(n.created_at).toLocaleString(
                        locale === "id" ? "id-ID" : "en-GB",
                        { timeZone: "Asia/Jakarta" },
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
