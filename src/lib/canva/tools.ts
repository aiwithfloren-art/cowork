import { tool } from "ai";
import { z } from "zod";
import { canvaFetch } from "./client";

/**
 * Canva agent tools. Returned by buildCanvaTools when the user has
 * an active "canva" connector row. Two of these — autofill_template
 * and export_design — are async on Canva's side and require polling
 * for completion; we poll up to a bounded number of attempts and
 * return either the finished resource or a "still in progress" hint.
 */

// Shape returned by Canva for design objects (subset we actually use).
type CanvaDesign = {
  id: string;
  title?: string | null;
  thumbnail?: { url: string } | null;
  url?: string | null;
  urls?: { edit_url?: string; view_url?: string } | null;
  updated_at?: number;
};

async function pollJob<T>(
  fetchOnce: () => Promise<{
    job: {
      id: string;
      status: "in_progress" | "success" | "failed";
      result?: T;
      error?: { message?: string };
    };
  }>,
  opts: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<{ ok: true; result: T } | { ok: false; reason: string }> {
  const max = opts.maxAttempts ?? 12; // ~24s default
  const interval = opts.intervalMs ?? 2000;
  for (let i = 0; i < max; i++) {
    const data = await fetchOnce();
    if (data.job.status === "success" && data.job.result) {
      return { ok: true, result: data.job.result };
    }
    if (data.job.status === "failed") {
      return {
        ok: false,
        reason: data.job.error?.message ?? "Canva job failed",
      };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { ok: false, reason: "Canva job still running after timeout" };
}

export function buildCanvaTools(userId: string) {
  return {
    canva_list_designs: tool({
      description:
        "List the user's Canva designs, most recently updated first. Use to find an existing design by partial title before editing or exporting it.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("optional title substring to filter by"),
        limit: z.number().int().min(1).max(50).default(20).optional(),
      }),
      execute: async ({ query, limit }) => {
        const params = new URLSearchParams({
          limit: String(limit ?? 20),
          ...(query ? { query } : {}),
        });
        const data = (await canvaFetch(
          userId,
          `/designs?${params.toString()}`,
        )) as { items?: CanvaDesign[] };
        return {
          designs: (data.items ?? []).map((d) => ({
            id: d.id,
            title: d.title ?? "(untitled)",
            edit_url: d.urls?.edit_url ?? d.url ?? null,
            view_url: d.urls?.view_url ?? null,
            thumbnail: d.thumbnail?.url ?? null,
          })),
        };
      },
    }),

    canva_list_brand_templates: tool({
      description:
        "List the user's Canva brand templates (only available on Canva Teams). Returns id + title + thumbnail. Use to find a template_id before calling canva_autofill_template.",
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20).optional(),
      }),
      execute: async ({ query, limit }) => {
        const params = new URLSearchParams({
          limit: String(limit ?? 20),
          ...(query ? { query } : {}),
        });
        const data = (await canvaFetch(
          userId,
          `/brand-templates?${params.toString()}`,
        )) as {
          items?: Array<{
            id: string;
            title?: string;
            thumbnail?: { url: string };
            view_url?: string;
          }>;
        };
        return {
          templates: (data.items ?? []).map((t) => ({
            id: t.id,
            title: t.title ?? "(untitled)",
            thumbnail: t.thumbnail?.url ?? null,
            view_url: t.view_url ?? null,
          })),
        };
      },
    }),

    canva_autofill_template: tool({
      description:
        "★ Killer tool for marketing teams: auto-generate a new Canva design from a brand template by filling its placeholder fields. Provide template_id (from canva_list_brand_templates) and a `data` object mapping field names to {type:'text', text:'...'} or {type:'image', asset_id:'...'}. Returns the new design's edit URL when ready.",
      inputSchema: z.object({
        template_id: z.string(),
        title: z.string().optional().describe("title of the new design"),
        data: z
          .record(z.string(), z.unknown())
          .describe(
            "field name → value. Text: { type: 'text', text: 'Your headline' }. Image: { type: 'image', asset_id: 'asset_xxx' }",
          ),
      }),
      execute: async ({ template_id, title, data }) => {
        const create = (await canvaFetch(userId, "/autofills", {
          method: "POST",
          body: JSON.stringify({
            brand_template_id: template_id,
            title,
            data,
          }),
        })) as { job: { id: string } };

        const result = await pollJob<{ design: CanvaDesign }>(async () => {
          return (await canvaFetch(
            userId,
            `/autofills/${create.job.id}`,
          )) as {
            job: {
              id: string;
              status: "in_progress" | "success" | "failed";
              result?: { design: CanvaDesign };
              error?: { message?: string };
            };
          };
        });

        if (!result.ok)
          return { error: result.reason, job_id: create.job.id };
        return {
          ok: true,
          design_id: result.result.design.id,
          edit_url: result.result.design.urls?.edit_url ?? null,
          view_url: result.result.design.urls?.view_url ?? null,
        };
      },
    }),

    canva_export_design: tool({
      description:
        "Export a Canva design to a downloadable file (PNG / PDF / JPG / GIF / MP4). Returns one or more URLs (one per page). Use after editing or autofilling, when the user wants to publish or download.",
      inputSchema: z.object({
        design_id: z.string(),
        format: z
          .enum(["png", "jpg", "pdf_standard", "gif", "mp4"])
          .default("png"),
      }),
      execute: async ({ design_id, format }) => {
        const create = (await canvaFetch(userId, "/exports", {
          method: "POST",
          body: JSON.stringify({
            design_id,
            format: { type: format },
          }),
        })) as { job: { id: string } };

        const result = await pollJob<{ urls: string[] }>(async () => {
          return (await canvaFetch(userId, `/exports/${create.job.id}`)) as {
            job: {
              id: string;
              status: "in_progress" | "success" | "failed";
              result?: { urls: string[] };
              error?: { message?: string };
            };
          };
        });

        if (!result.ok)
          return { error: result.reason, job_id: create.job.id };
        return { ok: true, urls: result.result.urls };
      },
    }),

    canva_create_design: tool({
      description:
        "Create a new blank Canva design with a given preset (e.g. 'instagram-post', 'presentation', 'a4-document') or custom dimensions. Returns the design id + edit URL.",
      inputSchema: z.object({
        title: z.string().optional(),
        preset: z
          .string()
          .optional()
          .describe(
            "Canva design type slug, e.g. 'instagram-post', 'presentation', 'a4-document'",
          ),
        width: z.number().int().min(40).max(8000).optional(),
        height: z.number().int().min(40).max(8000).optional(),
      }),
      execute: async ({ title, preset, width, height }) => {
        const body: Record<string, unknown> = { title };
        if (preset) body.design_type = { type: "preset", name: preset };
        else if (width && height)
          body.design_type = { type: "custom", width, height };

        const data = (await canvaFetch(userId, "/designs", {
          method: "POST",
          body: JSON.stringify(body),
        })) as { design?: CanvaDesign };
        if (!data.design) return { error: "Canva did not return a design" };
        return {
          ok: true,
          design_id: data.design.id,
          edit_url: data.design.urls?.edit_url ?? null,
        };
      },
    }),

    canva_list_folders: tool({
      description:
        "List the user's Canva folders. Useful for finding a parent folder to organize new designs into.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20).optional(),
      }),
      execute: async ({ limit }) => {
        const data = (await canvaFetch(
          userId,
          `/folders?limit=${limit ?? 20}`,
        )) as {
          items?: Array<{ id: string; name?: string; thumbnail?: { url: string } }>;
        };
        return {
          folders: (data.items ?? []).map((f) => ({
            id: f.id,
            name: f.name ?? "(untitled)",
          })),
        };
      },
    }),
  };
}
