"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

type Saved = {
  service: string;
  label: string | null;
  created_at: string;
};

const COMMON_SERVICES: Array<{ slug: string; name: string; docs: string }> = [
  { slug: "vercel", name: "Vercel", docs: "vercel.com/account/tokens" },
  { slug: "railway", name: "Railway", docs: "railway.app/account/tokens" },
  { slug: "netlify", name: "Netlify", docs: "app.netlify.com/user/applications" },
  { slug: "fly", name: "Fly.io", docs: "fly.io/user/personal_access_tokens" },
  { slug: "linear", name: "Linear", docs: "linear.app/settings/api" },
  { slug: "notion", name: "Notion", docs: "www.notion.so/my-integrations" },
  { slug: "stripe", name: "Stripe", docs: "dashboard.stripe.com/apikeys" },
  { slug: "openai", name: "OpenAI", docs: "platform.openai.com/api-keys" },
  { slug: "anthropic", name: "Anthropic", docs: "console.anthropic.com/settings/keys" },
  { slug: "airtable", name: "Airtable", docs: "airtable.com/create/tokens" },
  { slug: "resend", name: "Resend", docs: "resend.com/api-keys" },
];

export function CustomTokenForm({ initial }: { initial: Saved[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [service, setService] = useState("vercel");
  const [customService, setCustomService] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const resolvedService = service === "__other__" ? customService.trim() : service;
  const commonInfo = COMMON_SERVICES.find((s) => s.slug === resolvedService);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (!resolvedService || !/^[a-z0-9_-]+$/.test(resolvedService)) {
      setError("Service slug wajib lowercase, angka, dash/underscore saja.");
      return;
    }
    if (!token.trim()) {
      setError("Token wajib diisi.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/connectors/token/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service: resolvedService,
          token: token.trim(),
          label: label.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Save failed (${res.status})`);
        return;
      }
      setSaved(resolvedService);
      setToken("");
      setLabel("");
      setCustomService("");
      router.refresh();
    });
  }

  async function remove(svc: string) {
    if (!confirm(`Hapus token ${svc}?`)) return;
    startTransition(async () => {
      await fetch(
        `/api/connectors/token/remove?service=${encodeURIComponent(svc)}`,
        { method: "POST" },
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-slate-900">
          API tokens untuk service lain
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Paste API token dari service yang ga ada OAuth built-in (Vercel,
          Linear, Notion, dll). AI pake <code className="rounded bg-slate-100 px-1">http_request</code>{" "}
          + <code className="rounded bg-slate-100 px-1">get_credential</code>{" "}
          buat akses service-nya.
        </p>

        {initial.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {initial.map((s) => (
              <div
                key={s.service}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {s.service}
                  </p>
                  {s.label && (
                    <p className="text-xs text-slate-500">{s.label}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(s.service)}
                  disabled={pending}
                  className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Service
            </label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              {COMMON_SERVICES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
              <option value="__other__">Other (custom slug)</option>
            </select>
          </div>
          {service === "__other__" && (
            <input
              placeholder="Custom service slug (e.g. clickup, shopify)"
              value={customService}
              onChange={(e) => setCustomService(e.target.value.toLowerCase())}
              disabled={pending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
            />
          )}

          {commonInfo && (
            <p className="text-xs text-slate-500">
              Generate token di:{" "}
              <a
                href={`https://${commonInfo.docs}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline"
              >
                {commonInfo.docs}
              </a>
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Token
            </label>
            <input
              type="password"
              placeholder="Paste API token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Label (optional)
            </label>
            <input
              placeholder={'e.g. "Personal account"'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">
              ✅ Token {saved} saved.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save token"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
