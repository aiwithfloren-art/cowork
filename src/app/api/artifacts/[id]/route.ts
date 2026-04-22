import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

async function getUserAndId(req: Request, ctx: RouteCtx) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return { error: "Unauthorized", status: 401 } as const;
  const { id } = await ctx.params;
  if (!id) return { error: "Missing id", status: 400 } as const;
  return { uid, id } as const;
}

export async function GET(req: Request, ctx: RouteCtx) {
  const r = await getUserAndId(req, ctx);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("artifacts")
    .select(
      "id, user_id, agent_id, type, platform, title, body_markdown, meta, thumbnail_url, status, created_at, updated_at",
    )
    .eq("id", r.id)
    .eq("user_id", r.uid)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ artifact: data });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const r = await getUserAndId(req, ctx);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const body = (await req.json()) as {
    title?: string;
    body_markdown?: string;
    status?: "draft" | "sent" | "archived";
    meta?: Record<string, unknown>;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") update.title = body.title.slice(0, 200);
  if (typeof body.body_markdown === "string") update.body_markdown = body.body_markdown;
  if (body.status && ["draft", "sent", "archived"].includes(body.status)) {
    update.status = body.status;
  }
  if (body.meta && typeof body.meta === "object") update.meta = body.meta;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("artifacts")
    .update(update)
    .eq("id", r.id)
    .eq("user_id", r.uid)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  const r = await getUserAndId(req, ctx);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("artifacts")
    .delete()
    .eq("id", r.id)
    .eq("user_id", r.uid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
