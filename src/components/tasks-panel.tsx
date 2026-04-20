"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  due?: string;
  status: "needsAction" | "completed";
};

export function TasksPanel({
  initialTasks,
  labels,
}: {
  initialTasks: Task[];
  labels: { edit: string; delete: string; save: string; cancel: string; empty: string };
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function complete(id: string) {
    if (busyId) return;
    setBusyId(id);
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setTasks(prev);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (busyId) return;
    if (!confirm("Delete this task?")) return;
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

  if (tasks.length === 0) {
    return <p className="text-sm text-slate-500">{labels.empty}</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.slice(0, 8).map((t) => {
        const isEditing = editingId === t.id;
        return (
          <li
            key={t.id}
            className="group flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:border-slate-200"
          >
            <button
              type="button"
              onClick={() => complete(t.id)}
              disabled={busyId === t.id}
              title="Mark complete"
              aria-label="Mark complete"
              className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
            />
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
                title="Double-click to edit"
              >
                {t.title}
              </span>
            )}
            {t.due && !isEditing && (
              <span className="text-xs text-slate-500">
                {new Date(t.due).toLocaleDateString()}
              </span>
            )}
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
  );
}
