"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CompanyProfileStrings = {
  profileDesc: string;
  aboutLabel: string;
  aboutPlaceholder: string;
  brandToneLabel: string;
  brandTonePlaceholder: string;
  websitesLabel: string;
  websitesPlaceholder: string;
  empty: string;
  edit: string;
  save: string;
};

export function EditCompanyProfile({
  orgId,
  canEdit,
  initialDescription,
  initialBrandTone,
  initialWebsites,
  t,
}: {
  orgId: string;
  canEdit: boolean;
  initialDescription: string;
  initialBrandTone: string;
  initialWebsites: string[];
  t: CompanyProfileStrings;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const [brandTone, setBrandTone] = useState(initialBrandTone);
  const [websitesText, setWebsitesText] = useState(initialWebsites.join("\n"));

  async function save() {
    setSaving(true);
    try {
      const websites = websitesText
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean);
      const res = await fetch("/api/team/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          description: description.trim(),
          brand_tone: brandTone.trim(),
          websites,
        }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t.profileDesc}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            {t.aboutLabel}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            rows={5}
            maxLength={2000}
            placeholder={t.aboutPlaceholder}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            {description.length} / 2000
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            {t.brandToneLabel}
          </span>
          <input
            type="text"
            value={brandTone}
            onChange={(e) => setBrandTone(e.target.value)}
            disabled={saving}
            maxLength={300}
            placeholder={t.brandTonePlaceholder}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            {brandTone.length} / 300
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            {t.websitesLabel}
          </span>
          <textarea
            value={websitesText}
            onChange={(e) => setWebsitesText(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder={t.websitesPlaceholder}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "…" : t.save}
          </button>
          <button
            onClick={() => {
              setDescription(initialDescription);
              setBrandTone(initialBrandTone);
              setWebsitesText(initialWebsites.join("\n"));
              setEditing(false);
            }}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const hasContent =
    initialDescription.trim().length > 0 ||
    initialBrandTone.trim().length > 0 ||
    initialWebsites.length > 0;

  return (
    <div className="space-y-3">
      {hasContent ? (
        <div className="space-y-3">
          {initialDescription.trim() && (
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {initialDescription}
            </p>
          )}
          {initialBrandTone.trim() && (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">{t.brandToneLabel}:</span>{" "}
              {initialBrandTone}
            </p>
          )}
          {initialWebsites.length > 0 && (
            <ul className="space-y-1">
              {initialWebsites.map((w) => (
                <li key={w} className="text-sm">
                  <a
                    href={w}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-500 hover:underline"
                  >
                    {w}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t.empty}</p>
      )}
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          ✏️ {t.edit}
        </button>
      )}
    </div>
  );
}

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
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
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
      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
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
