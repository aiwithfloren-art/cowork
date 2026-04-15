"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

type Props = {
  hasGmail: boolean;
  hasGmailSend: boolean;
  hasDriveFile: boolean;
};

export function ConnectGoogle({ hasGmail, hasGmailSend, hasDriveFile }: Props) {
  const [loading, setLoading] = useState(false);

  async function reconnect() {
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/settings" });
    } finally {
      setLoading(false);
    }
  }

  const missing: string[] = [];
  if (!hasGmail) missing.push("Gmail read");
  if (!hasGmailSend) missing.push("Gmail send");
  if (!hasDriveFile) missing.push("Drive files");

  if (missing.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          ✅ All Google permissions granted. Sigap can access your Calendar,
          Tasks, Drive (picked files), and Gmail (read + send).
        </div>
        <button
          onClick={reconnect}
          disabled={loading}
          className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
        >
          {loading ? "Redirecting…" : "Re-authenticate with Google (force refresh scopes)"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">
        ⚠️ New Google permissions available: {missing.join(", ")}
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Re-authenticate to grant these new scopes. Sigap AI will then be able
        to read these sources when you ask.
      </p>
      <button
        onClick={reconnect}
        disabled={loading}
        className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Re-authenticate with Google"}
      </button>
    </div>
  );
}
