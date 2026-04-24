import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { disconnectToolkit } from "@/lib/composio/tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toolkit } = (await req.json()) as { toolkit?: string };
  if (!toolkit) {
    return NextResponse.json({ error: "toolkit required" }, { status: 400 });
  }

  const result = await disconnectToolkit(uid, toolkit);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
