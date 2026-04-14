"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type PickedFile = {
  file_id: string;
  file_name: string;
  mime_type: string;
};

type Props = {
  onPicked: (files: PickedFile[]) => void;
  label?: string;
};

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

export function FilePicker({ onPicked, label = "Add file from Drive" }: Props) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load gapi + picker scripts once
  useEffect(() => {
    function loadScript(src: string): Promise<void> {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    }

    loadScript("https://apis.google.com/js/api.js")
      .then(
        () =>
          new Promise<void>((resolve) => {
            window.gapi.load("picker", { callback: () => resolve() });
          }),
      )
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);

  const openPicker = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get fresh access token + API key from server
      const res = await fetch("/api/google/access-token");
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        throw new Error(data.error || "No access token");
      }
      if (!data.api_key) {
        throw new Error(
          "Google API key not configured. Admin must set NEXT_PUBLIC_GOOGLE_API_KEY.",
        );
      }

      const view = new window.google.picker.DocsView(
        window.google.picker.ViewId.DOCS,
      )
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        .setMode(window.google.picker.DocsViewMode.LIST);

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(data.client_id?.split("-")[0] || "")
        .setOAuthToken(data.access_token)
        .setDeveloperKey(data.api_key)
        .addView(view)
        .setCallback(async (result: any) => {
          if (result.action === window.google.picker.Action.PICKED) {
            const docs = result.docs as Array<{
              id: string;
              name: string;
              mimeType: string;
            }>;
            const picked: PickedFile[] = docs.map((d) => ({
              file_id: d.id,
              file_name: d.name,
              mime_type: d.mimeType,
            }));

            // Save to DB
            try {
              const saveRes = await fetch("/api/files/add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files: picked }),
              });
              if (!saveRes.ok) {
                const err = await saveRes.json();
                setError(err.error || "Save failed");
                return;
              }
              onPicked(picked);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Save failed");
            }
          }
        })
        .build();

      picker.setVisible(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open picker");
    } finally {
      setLoading(false);
    }
  }, [onPicked]);

  return (
    <div>
      <button
        onClick={openPicker}
        disabled={!ready || loading}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Opening…" : ready ? label : "Loading Picker…"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
