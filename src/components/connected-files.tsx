"use client";

import { useEffect, useState } from "react";
import { FilePicker } from "./file-picker";

type FileItem = {
  id: string;
  file_id: string;
  file_name: string;
  mime_type: string;
  added_at: string;
  visibility: "private" | "team" | "org";
};

export function ConnectedFiles() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/files/list");
      const data = await res.json();
      setFiles(data.files ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setVisibility(
    fileId: string,
    visibility: "private" | "team" | "org",
  ) {
    setBusy(fileId);
    try {
      await fetch("/api/files/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, visibility }),
      });
      setFiles((prev) =>
        prev.map((f) => (f.file_id === fileId ? { ...f, visibility } : f)),
      );
    } finally {
      setBusy(null);
    }
  }

  async function bulkVisibility(visibility: "private" | "team") {
    const label = visibility === "team" ? "share all files with your team" : "make all files private";
    if (!confirm(`Are you sure you want to ${label}?`)) return;
    setBusy("*");
    try {
      await fetch("/api/files/bulk-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      setFiles((prev) => prev.map((f) => ({ ...f, visibility })));
    } finally {
      setBusy(null);
    }
  }

  async function remove(fileId: string) {
    await fetch("/api/files/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  }

  const sharedCount = files.filter((f) => f.visibility !== "private").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Pick Google Drive files that Sigap AI can read. Sigap will only access files
        you explicitly add here — not your entire Drive. Each file has its own
        visibility setting.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <FilePicker onPicked={() => load()} label="+ Add file from Drive" />

        {files.length > 0 && (
          <>
            <button
              onClick={() => bulkVisibility("team")}
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              👥 Share all with team
            </button>
            <button
              onClick={() => bulkVisibility("private")}
              disabled={busy !== null}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              🔒 Make all private
            </button>
          </>
        )}
      </div>

      {files.length > 0 && (
        <p className="text-xs text-slate-500">
          {sharedCount} of {files.length} file{files.length === 1 ? "" : "s"} shared with team · {files.length - sharedCount} private
        </p>
      )}

      <div>
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-slate-400">No files connected yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span>{iconFor(f.mime_type)}</span>
                  <span className="truncate text-slate-900">{f.file_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={f.visibility}
                    onChange={(e) =>
                      setVisibility(
                        f.file_id,
                        e.target.value as "private" | "team",
                      )
                    }
                    disabled={busy !== null}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                    aria-label="Visibility"
                  >
                    <option value="private">🔒 Private</option>
                    <option value="team">👥 Team</option>
                  </select>
                  <button
                    onClick={() => remove(f.file_id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label="Remove"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function iconFor(mime: string): string {
  if (mime.includes("document")) return "📄";
  if (mime.includes("spreadsheet")) return "📊";
  if (mime.includes("presentation")) return "🖼️";
  if (mime.includes("pdf")) return "📕";
  if (mime.startsWith("image/")) return "🖼️";
  return "📎";
}
