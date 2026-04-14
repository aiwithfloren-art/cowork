import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type DocFile = { id: string; name: string; mimeType: string };

export async function readDoc(userId: string, docId: string): Promise<string> {
  const auth = await getGoogleClient(userId);

  // Google Docs API only works for native Google Docs
  try {
    const docs = google.docs({ version: "v1", auth });
    const res = await docs.documents.get({ documentId: docId });
    const doc = res.data;
    let out = "";
    for (const el of doc.body?.content ?? []) {
      if (el.paragraph) {
        for (const t of el.paragraph.elements ?? []) {
          out += t.textRun?.content ?? "";
        }
      }
    }
    const trimmed = out.trim();
    if (trimmed) return trimmed.slice(0, 8000);
  } catch {
    // Fall through to Drive export
  }

  // Fallback: use Drive files.export for other Google Workspace formats
  // (Sheets, Slides) or .get + .alt=media for binary files.
  const drive = google.drive({ version: "v3", auth });
  try {
    // Try export as plain text (works for Docs, Slides)
    const res = await drive.files.export(
      { fileId: docId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
    return text.trim().slice(0, 8000);
  } catch (e) {
    throw new Error(
      `Could not read file: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }
}
