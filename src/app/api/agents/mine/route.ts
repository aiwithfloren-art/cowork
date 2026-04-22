import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Compact list of the caller's activated AI employees — used by the main
 * chat's @mention autocomplete so the client can resolve `@amore` to a
 * specific agent slug without doing its own DB query per keystroke.
 */
export async function GET() {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("custom_agents")
    .select("slug, name, emoji, description")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  return NextResponse.json({
    agents: (data ?? []).map((a) => ({
      slug: a.slug as string,
      name: a.name as string,
      emoji: (a.emoji as string | null) ?? "🤖",
      description: (a.description as string | null) ?? "",
    })),
  });
}
