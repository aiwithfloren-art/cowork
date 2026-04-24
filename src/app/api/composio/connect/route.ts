import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateConnectUrl } from "@/lib/composio/tools";
import { getAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";

/**
 * POST /api/composio/connect
 * Body: { toolkit: "notion" | "linear" | ... }
 * Returns: { redirectUrl } — frontend navigates user here to OAuth.
 *
 * Requires an auth config per toolkit in the Composio dashboard;
 * the corresponding ID must be set as COMPOSIO_AUTH_<TOOLKIT>.
 */
export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { toolkit } = (await req.json()) as { toolkit?: string };
  if (!toolkit) {
    return NextResponse.json({ error: "toolkit required" }, { status: 400 });
  }

  const callbackUrl = `${getAppUrl(req)}/settings/connectors`;

  const result = await generateConnectUrl(uid, toolkit, callbackUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ redirectUrl: result.redirectUrl });
}
