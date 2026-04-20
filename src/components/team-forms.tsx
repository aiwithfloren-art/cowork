"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateOrgForm({
  placeholder,
  buttonLabel,
}: {
  placeholder: string;
  buttonLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "…" : buttonLabel}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function InviteForm({
  orgId,
  t,
}: {
  orgId: string;
  t: {
    invitePlaceholder: string;
    inviteMember_role: string;
    inviteManager_role: string;
    inviteSend: string;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, org_id: orgId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg({ type: "ok", text: `Invite sent to ${email}` });
      setEmail("");
      router.refresh();
    } catch (e) {
      setMsg({
        type: "err",
        text: e instanceof Error ? e.message : "Failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.invitePlaceholder}
        required
        disabled={loading}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        disabled={loading}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="member">{t.inviteMember_role}</option>
        <option value="manager">{t.inviteManager_role}</option>
      </select>
      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "…" : t.inviteSend}
      </button>
      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

export function PrivacyToggle({
  orgId,
  initialShare,
  label,
  saveLabel,
}: {
  orgId: string;
  initialShare: boolean;
  label: string;
  saveLabel: string;
}) {
  const router = useRouter();
  const [share, setShare] = useState(initialShare);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/team/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, share }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  const dirty = share !== initialShare;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            setSaved(false);
          }}
          className="h-4 w-4"
        />
        {label}
      </label>
      <button
        type="submit"
        disabled={loading || !dirty}
        className={
          "rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 " +
          (dirty
            ? "border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-500"
            : "border-slate-200 hover:bg-slate-50")
        }
      >
        {loading ? "…" : saveLabel}
      </button>
      {dirty && !loading && !saved && (
        <span className="text-xs text-amber-600">● unsaved changes</span>
      )}
      {saved && (
        <span className="text-xs text-emerald-600">✓ saved</span>
      )}
    </form>
  );
}
