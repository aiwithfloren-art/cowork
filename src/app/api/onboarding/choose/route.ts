import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { intent } = (await req.json()) as { intent: "personal" | "team" };
  if (intent !== "personal" && intent !== "team") {
    return NextResponse.json({ error: "Invalid intent" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  await sb.from("user_settings").upsert({
    user_id: userId,
    onboarded_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    redirect: intent === "team" ? "/team" : "/dashboard",
  });
}
