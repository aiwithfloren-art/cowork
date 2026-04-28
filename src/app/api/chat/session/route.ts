import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const agentSlug = url.searchParams.get("agent");
  const sb = supabaseAdmin();

  let agentId: string | null = null;
  if (agentSlug) {
    const { data: agent } = await sb
      .from("custom_agents")
      .select("id")
      .eq("user_id", uid)
      .eq("slug", agentSlug)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    agentId = agent.id;
  }

  let q = sb.from("chat_messages").delete().eq("user_id", uid);
  if (agentId) q = q.eq("agent_id", agentId);
  else q = q.is("agent_id", null);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Load all messages in the same "session window" around a pivot message.
// A session = chain of messages where each consecutive pair is within 30 minutes.
export async function GET(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pivotId = url.searchParams.get("pivot");
  const wantsLatest = url.searchParams.get("latest") === "true";
  const recentN = url.searchParams.get("recent");
  const agentSlug = url.searchParams.get("agent");

  // Mode 3: list N most recent sessions (for sidebar drawer in chat).
  // Each session is summarized by its first user message + pivot id so
  // the client can navigate to ?resume=<id> and reload that thread.
  if (recentN) {
    const limit = Math.max(1, Math.min(20, parseInt(recentN, 10) || 5));
    const sb2 = supabaseAdmin();
    let aId: string | null = null;
    if (agentSlug) {
      const { data: agent } = await sb2
        .from("custom_agents")
        .select("id")
        .eq("user_id", uid)
        .eq("slug", agentSlug)
        .maybeSingle();
      if (!agent) return NextResponse.json({ sessions: [] });
      aId = agent.id;
    }

    let q = sb2
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .limit(500);
    q = aId ? q.eq("agent_id", aId) : q.is("agent_id", null);
    const { data: all } = await q;
    const msgs = (all ?? []) as Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
    }>;
    if (msgs.length === 0) return NextResponse.json({ sessions: [] });

    const GAP = 30 * 60 * 1000;
    const groups: typeof msgs[] = [[msgs[0]]];
    for (let i = 1; i < msgs.length; i++) {
      const prev = new Date(groups.at(-1)!.at(-1)!.created_at).getTime();
      const curr = new Date(msgs[i].created_at).getTime();
      if (curr - prev <= GAP) groups.at(-1)!.push(msgs[i]);
      else groups.push([msgs[i]]);
    }
    const recent = groups
      .slice(-limit)
      .reverse()
      .map((g) => {
        const firstUser = g.find((m) => m.role === "user") ?? g[0];
        const title = firstUser.content.slice(0, 80);
        return {
          pivot_id: firstUser.id,
          title,
          started_at: firstUser.created_at,
          message_count: g.filter((m) => m.role === "user" || m.role === "assistant")
            .length,
        };
      });
    return NextResponse.json({ sessions: recent });
  }

  if (!pivotId && !wantsLatest) {
    return NextResponse.json({ error: "pivot, latest=true, or recent=N required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  let agentId: string | null = null;
  if (agentSlug) {
    const { data: agent } = await sb
      .from("custom_agents")
      .select("id")
      .eq("user_id", uid)
      .eq("slug", agentSlug)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ messages: [] });
    }
    agentId = agent.id;
  }

  // Fetch all user messages ordered, then resolve the pivot (either the
  // explicitly requested id, or — when latest=true — the most recent one).
  let q = sb
    .from("chat_messages")
    .select("id, role, content, created_at, agent_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: true })
    .limit(500);
  if (agentId) {
    q = q.eq("agent_id", agentId);
  } else {
    q = q.is("agent_id", null);
  }
  const { data: all } = await q;

  const msgs = all ?? [];
  if (msgs.length === 0) return NextResponse.json({ messages: [] });

  const pivotIdx = pivotId
    ? msgs.findIndex((m) => m.id === pivotId && m.role !== "tool")
    : msgs.length - 1;

  if (pivotId && pivotIdx === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const GAP_MS = 30 * 60 * 1000;
  let start = pivotIdx;
  while (start > 0) {
    const prev = new Date(msgs[start - 1].created_at).getTime();
    const curr = new Date(msgs[start].created_at).getTime();
    if (curr - prev > GAP_MS) break;
    start--;
  }
  let end = pivotIdx;
  while (end < msgs.length - 1) {
    const curr = new Date(msgs[end].created_at).getTime();
    const next = new Date(msgs[end + 1].created_at).getTime();
    if (next - curr > GAP_MS) break;
    end++;
  }

  return NextResponse.json({
    messages: msgs
      .slice(start, end + 1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  });
}
