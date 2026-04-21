import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data: agent } = await sb
    .from("custom_agents")
    .select("id")
    .eq("user_id", uid)
    .eq("slug", slug)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const { data } = await sb
    .from("agent_digests")
    .select("id, summary, status, created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ digests: data ?? [] });
}
