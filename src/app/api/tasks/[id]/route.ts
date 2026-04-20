import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { completeTask, deleteTask, updateTask } from "@/lib/google/tasks";

export const runtime = "nodejs";

async function requireUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return userId;
}

// PATCH /api/tasks/:id — complete (body: { status: "completed" }) or update title/notes/due
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    status?: "completed" | "needsAction";
    title?: string;
    notes?: string;
    due?: string;
  };

  try {
    if (body.status === "completed") {
      await completeTask(userId, id);
      return NextResponse.json({ ok: true });
    }
    const updates: { title?: string; notes?: string; due?: string } = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.due !== undefined) updates.due = body.due;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }
    await updateTask(userId, id, updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 500 },
    );
  }
}

// DELETE /api/tasks/:id
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    await deleteTask(userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delete failed" },
      { status: 500 },
    );
  }
}
