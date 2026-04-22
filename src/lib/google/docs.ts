import { google } from "googleapis";
import { Readable } from "stream";
import { getGoogleClient } from "./client";

export type DocFile = { id: string; name: string; mimeType: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Minimal markdown → HTML converter for Google Docs upload. Covers the
 * cases LLMs actually produce: headings, bullets, numbered lists, bold,
 * italic, links, paragraph breaks. Good enough for Drive's HTML→Doc
 * auto-conversion — we don't need a full CommonMark compliance here.
 */
function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeLists();
      continue;
    }
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      closeLists();
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`);
      continue;
    }
    const ulm = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulm) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(ulm[1])}</li>`);
      continue;
    }
    const olm = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olm) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(olm[1])}</li>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return `<!DOCTYPE html><html><body>${out.join("\n")}</body></html>`;
}

/**
 * Create a new Google Doc in the user's Drive, populated with the given
 * content. Content is treated as markdown and converted to HTML so that
 * Drive's HTML→Doc import preserves headings, bullets, bold, italic,
 * links. Returns the Doc id + shareable URL.
 *
 * Scope: drive.file — sufficient because files we create ARE ours by
 * definition, so we can read/write them without drive.full.
 */
export async function createDoc(
  userId: string,
  title: string,
  contentMarkdown: string,
): Promise<{ id: string; url: string }> {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const html = markdownToHtml(contentMarkdown);

  const res = await drive.files.create({
    requestBody: {
      name: title.slice(0, 200),
      mimeType: "application/vnd.google-apps.document",
    },
    media: {
      mimeType: "text/html",
      body: Readable.from([Buffer.from(html, "utf-8")]),
    },
    fields: "id",
  });

  const id = res.data.id;
  if (!id) throw new Error("Doc creation returned no id");
  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
}

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
