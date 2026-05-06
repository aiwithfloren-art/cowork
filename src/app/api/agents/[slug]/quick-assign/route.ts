import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assignTemplateToUsers,
  findOrPublishTemplate,
} from "@/lib/agents/assign-to-users";

export const runtime = "nodejs";

/**
 * One-shot "publish-if-needed + assign" from a personal agent slug.
 * Saves admins from the manual two-step flow (Publish → then Assign).
 *
 * If the agent has never been published, this auto-publishes it as an
 * org template. If it was published before, the snapshot is refreshed
 * with the latest prompt + tools so newly-assigned employees get the
 * current version. Existing assignees keep their cloned copy unchanged
 * (same trade-off as the original publish flow).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const actor = session?.user as
    | { id?: string; name?: string | null }
    | undefined;
  if (!actor?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as {
    user_ids?: string[];
    note?: string;
  } | null;
  const userIds = body?.user_ids?.filter((s) => typeof s === "string") ?? [];
  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "user_ids array required" },
      { status: 400 },
    );
  }
  const note = body?.note?.trim().slice(0, 500) || null;

  const tmplResult = await findOrPublishTemplate({
    ownerUserId: actor.id,
    agentSlug: slug,
  });
  if (!tmplResult.ok) {
    return NextResponse.json(
      { error: tmplResult.error },
      { status: tmplResult.status },
    );
  }

  const results = await assignTemplateToUsers({
    template: tmplResult.template,
    actor: { id: actor.id, name: actor.name ?? null },
    userIds,
    note,
  });

  return NextResponse.json({
    results,
    template_id: tmplResult.template.id,
    auto_published: tmplResult.published_now,
  });
}
