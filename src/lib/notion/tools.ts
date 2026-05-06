import { tool } from "ai";
import { z } from "zod";
import { getNotionToken, notionFetch } from "./client";

type SearchResult = {
  results: Array<{
    id: string;
    object: string;
    properties?: Record<string, unknown>;
    parent?: Record<string, unknown>;
    url?: string;
  }>;
};

type PageBlock = {
  id: string;
  type?: string;
  paragraph?: { rich_text: Array<{ plain_text?: string }> };
  heading_1?: { rich_text: Array<{ plain_text?: string }> };
  heading_2?: { rich_text: Array<{ plain_text?: string }> };
  heading_3?: { rich_text: Array<{ plain_text?: string }> };
  bulleted_list_item?: { rich_text: Array<{ plain_text?: string }> };
  numbered_list_item?: { rich_text: Array<{ plain_text?: string }> };
  to_do?: { rich_text: Array<{ plain_text?: string }>; checked?: boolean };
};

function blocksToPlainText(blocks: PageBlock[]): string {
  return blocks
    .map((b) => {
      const rt =
        b.paragraph?.rich_text ??
        b.heading_1?.rich_text ??
        b.heading_2?.rich_text ??
        b.heading_3?.rich_text ??
        b.bulleted_list_item?.rich_text ??
        b.numbered_list_item?.rich_text ??
        b.to_do?.rich_text ??
        [];
      const text = rt.map((r) => r.plain_text ?? "").join("");
      if (!text) return "";
      if (b.type?.startsWith("heading")) return `\n## ${text}\n`;
      if (b.type === "bulleted_list_item") return `- ${text}`;
      if (b.type === "numbered_list_item") return `1. ${text}`;
      if (b.type === "to_do")
        return `${b.to_do?.checked ? "[x]" : "[ ]"} ${text}`;
      return text;
    })
    .filter(Boolean)
    .join("\n");
}

function getPageTitle(props?: Record<string, unknown>): string {
  if (!props) return "Untitled";
  for (const v of Object.values(props)) {
    const p = v as { type?: string; title?: Array<{ plain_text?: string }> };
    if (p?.type === "title") {
      return p.title?.map((t) => t.plain_text ?? "").join("") || "Untitled";
    }
  }
  return "Untitled";
}

export function buildNotionTools(userId: string) {
  return {
    notion_search: tool({
      description:
        "Search pages in the user's Notion workspace by keyword. Returns matching page IDs, titles, and URLs.",
      inputSchema: z.object({
        query: z.string().describe("keyword(s) to search for"),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        const token = await getNotionToken(userId);
        if (!token) return { error: "Notion not connected. Connect at /integrations." };
        const data = (await notionFetch(token, "/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            page_size: limit ?? 10,
            filter: { property: "object", value: "page" },
          }),
        })) as SearchResult;
        return {
          results: data.results.map((r) => ({
            id: r.id,
            title: getPageTitle(r.properties),
            url: r.url,
          })),
        };
      },
    }),

    notion_read_page: tool({
      description:
        "Read the full content of a Notion page by ID. Returns the page title plus a plain-text rendering of all blocks.",
      inputSchema: z.object({
        page_id: z.string().describe("Notion page ID (UUID with or without dashes)"),
      }),
      execute: async ({ page_id }) => {
        const token = await getNotionToken(userId);
        if (!token) return { error: "Notion not connected. Connect at /integrations." };
        const page = (await notionFetch(token, `/pages/${page_id}`)) as {
          properties?: Record<string, unknown>;
          url?: string;
        };
        const blocksData = (await notionFetch(
          token,
          `/blocks/${page_id}/children?page_size=100`,
        )) as { results: PageBlock[] };
        return {
          id: page_id,
          title: getPageTitle(page.properties),
          url: page.url,
          content: blocksToPlainText(blocksData.results),
        };
      },
    }),

    notion_create_page: tool({
      description:
        "Create a new Notion page under a parent page. The parent must already be shared with Sigap's integration. Use markdown-style content; it gets converted to Notion blocks.",
      inputSchema: z.object({
        parent_page_id: z
          .string()
          .describe("ID of the parent page (must be shared with the integration)"),
        title: z.string(),
        content: z.string().describe("Plain text or simple markdown body"),
      }),
      execute: async ({ parent_page_id, title, content }) => {
        const token = await getNotionToken(userId);
        if (!token) return { error: "Notion not connected. Connect at /integrations." };
        const blocks = content
          .split("\n")
          .filter((l) => l.trim())
          .map((line) => ({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: line } }],
            },
          }));
        const data = (await notionFetch(token, "/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { page_id: parent_page_id },
            properties: {
              title: { title: [{ type: "text", text: { content: title } }] },
            },
            children: blocks,
          }),
        })) as { id: string; url: string };
        return { id: data.id, url: data.url, ok: true };
      },
    }),

    notion_append_to_page: tool({
      description:
        "Append paragraphs to the bottom of an existing Notion page. Each line in `content` becomes a new paragraph block.",
      inputSchema: z.object({
        page_id: z.string(),
        content: z.string(),
      }),
      execute: async ({ page_id, content }) => {
        const token = await getNotionToken(userId);
        if (!token) return { error: "Notion not connected. Connect at /integrations." };
        const blocks = content
          .split("\n")
          .filter((l) => l.trim())
          .map((line) => ({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: line } }],
            },
          }));
        await notionFetch(token, `/blocks/${page_id}/children`, {
          method: "PATCH",
          body: JSON.stringify({ children: blocks }),
        });
        return { ok: true, blocks_added: blocks.length };
      },
    }),
  };
}
