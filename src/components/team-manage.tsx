"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RenameOrgButton({
  orgId,
  currentName,
}: {
  orgId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || name === currentName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/team/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, name: name.trim() }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to rename");
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
          autoFocus
        />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setName(currentName);
            setEditing(false);
          }}
          disabled={saving}
          className="rounded-md px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-slate-500 hover:text-indigo-600"
    >
      ✏️ Rename
    </button>
  );
}

export function DeleteOrgButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function confirmAndDelete() {
    const ok = window.confirm(
      "Hapus organization ini permanen? Semua member dihapus dari org, task assignments berhenti. Team notes tetap ada tapi jadi unattached. Aksi ini tidak bisa di-undo.",
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/team/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (res.ok) {
        router.push("/team");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={confirmAndDelete}
      disabled={deleting}
      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "🗑 Delete org"}
    </button>
  );
}

export function RemoveMemberButton({
  orgId,
  userId,
  memberName,
}: {
  orgId: string;
  userId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function confirmAndRemove() {
    const ok = window.confirm(`Remove ${memberName} from this organization?`);
    if (!ok) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/team/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, user_id: userId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed");
        setRemoving(false);
      }
    } catch {
      setRemoving(false);
    }
  }

  return (
    <button
      onClick={confirmAndRemove}
      disabled={removing}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
      title="Remove from org"
    >
      {removing ? "…" : "✕"}
    </button>
  );
}
