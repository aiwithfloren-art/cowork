import { google } from "googleapis";
import { getGoogleClient } from "./client";

export type DocFile = { id: string; name: string; mimeType: string };

export async function searchDocs(userId: string, query: string): Promise<DocFile[]> {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `name contains '${query.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
    pageSize: 10,
    fields: "files(id,name,mimeType)",
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
  }));
}

export async function readDoc(userId: string, docId: string): Promise<string> {
  const auth = await getGoogleClient(userId);
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
  return out.trim().slice(0, 8000);
}
