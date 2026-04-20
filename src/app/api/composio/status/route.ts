import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listConnectedToolkits } from "@/lib/composio/tools";

export const runtime = "nodejs";

/**
 * GET /api/composio/status
 * Returns the list of Composio toolkits the authenticated user has
 * connected (ACTIVE status).
 */
export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const connected = await listConnectedToolkits(uid);
  const enabledRaw = process.env.COMPOSIO_TOOLKITS || "";
  const enabled = enabledRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return NextResponse.json({ enabled, connected });
}
