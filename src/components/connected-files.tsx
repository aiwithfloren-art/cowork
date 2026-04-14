"use client";

import { useEffect, useState } from "react";
import { FilePicker } from "./file-picker";

type FileItem = {
  id: string;
  file_id: string;
  file_name: string;
  mime_type: string;
  added_at: string;
};

export function ConnectedFiles() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function remove(fileId: string) {
    await fetch("/api/files/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Pick Google Drive files that Sigap AI can read. Sigap will only have access
        to the files you explicitly add here — not your entire Drive.
      </p>

      <FilePicker onPicked={() => load()} label="+ Add file from Drive" />

      <div className="mt-4">
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-slate-400">No files connected yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span>{iconFor(f.mime_type)}</span>
                  <span className="truncate text-slate-900">{f.file_name}</span>
                </div>
                <button
                  onClick={() => remove(f.file_id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                  aria-label="Remove"
                >
                  Remove
                </button>
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
