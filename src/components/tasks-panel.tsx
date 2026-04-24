"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  due?: string;
  status: "needsAction" | "completed";
};

type UndoEntry = { task: Task; expiresAt: number };

export function TasksPanel({
  initialTasks,
  labels,
  locale = "en",
}: {
  initialTasks: Task[];
  labels: { edit: string; delete: string; save: string; cancel: string; empty: string };
  locale?: "en" | "id";
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);

  // Sync local state when parent passes fresh initialTasks — triggered by
  // router.refresh() after the chat agent adds/edits/deletes a task.
  // Without this, useState(initialTasks) only takes the value once and
  // the panel stays stale until a full page reload.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Auto-dismiss undo toast after 5s
  useEffect(() => {
    if (!undoEntry) return;
    const ms = undoEntry.expiresAt - Date.now();
    if (ms <= 0) {
      setUndoEntry(null);
      return;
    }
    const t = setTimeout(() => setUndoEntry(null), ms);
    return () => clearTimeout(t);
  }, [undoEntry]);

  async function complete(task: Task) {
    if (busyId) return;
    setBusyId(task.id);
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    setUndoEntry({ task, expiresAt: Date.now() + 5000 });
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setTasks(prev);
      setUndoEntry(null);
    } finally {
      setBusyId(null);
    }
  }

  async function undoComplete() {
    if (!undoEntry) return;
    const { task } = undoEntry;
    setUndoEntry(null);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "needsAction" }),
      });
      setTasks((ts) => [task, ...ts]);
      router.refresh();
    } catch {
      // noop — the task is already completed on Google side
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    if (!confirm(locale === "id" ? "Hapus task ini?" : "Delete this task?")) return;
    setBusyId(id);
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setTasks(prev);
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(id: string) {
    const title = editValue.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setTasks(prev);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (tasks.length === 0 && !undoEntry) {
    return <p className="text-sm text-slate-500">{labels.empty}</p>;
  }

  return (
    <div className="relative">
      <ul className="space-y-2">
        {tasks.slice(0, 8).map((t) => {
          const isEditing = editingId === t.id;
          return (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-slate-200"
            >
              <button
                type="button"
                onClick={() => complete(t)}
                disabled={busyId === t.id}
                title={locale === "id" ? "Tandai selesai" : "Mark complete"}
                aria-label={locale === "id" ? "Tandai selesai" : "Mark complete"}
                className="group/check relative h-5 w-5 shrink-0 rounded-full border-2 border-slate-300 transition-colors hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-indigo-500 opacity-0 group-hover/check:opacity-100">
                  ✓
                </span>
              </button>
              {isEditing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveEdit(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(t.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 rounded border border-indigo-200 bg-white px-2 py-0.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              ) : (
                <span
                  className="flex-1 text-sm text-slate-900"
                  onDoubleClick={() => {
                    setEditingId(t.id);
                    setEditValue(t.title);
                  }}
                  title={locale === "id" ? "Double-klik untuk edit" : "Double-click to edit"}
                >
                  {t.title}
                </span>
              )}
              {t.due && !isEditing && (
                <span className="hidden text-xs text-slate-500 sm:inline">
                  {formatDate(t.due)}
                </span>
              )}
              {/* Actions: always visible on mobile, reveal on hover on desktop */}
              <div className="flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditValue(t.title);
                  }}
                  disabled={busyId === t.id}
                  title={labels.edit}
                  aria-label={labels.edit}
                  className="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={busyId === t.id}
                  title={labels.delete}
                  aria-label={labels.delete}
                  className="rounded p-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {undoEntry && (
        <div
          role="status"
          className="pointer-events-auto fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>
            {locale === "id" ? "Task selesai" : "Task completed"}:{" "}
            <strong className="font-medium">{undoEntry.task.title}</strong>
          </span>
          <button
            type="button"
            onClick={undoComplete}
            className="rounded px-2 py-0.5 text-xs font-medium text-indigo-300 hover:bg-slate-800"
          >
            {locale === "id" ? "Urungkan" : "Undo"}
          </button>
        </div>
      )}
    </div>
  );
}
