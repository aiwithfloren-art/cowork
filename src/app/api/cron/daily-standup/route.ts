import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/google/gmail";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Async standup prompt. Runs weekday mornings at 09:00 Asia/Jakarta
 * (02:00 UTC Mon-Fri). For every org, pings every member who shares
 * with manager — asks them what they're planning today. Responses
 * are captured as team-visible notes via the usual chat flow, which
 * managers can aggregate with get_notes later.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  const { data: orgs } = await sb.from("organizations").select("id, name");
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, orgs: 0 });
  }

  let pinged = 0;
  let errors = 0;

  for (const org of orgs) {
    const { data: members } = await sb
      .from("org_members")
      .select("user_id, role, users:user_id(name, email)")
      .eq("org_id", org.id)
      .eq("share_with_manager", true);

    const memberList = (members ?? []).filter(
      (m) => m.role === "member" || m.role === "manager",
    );
    if (memberList.length === 0) continue;

    const { data: ownerMember } = await sb
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("role", "owner")
      .maybeSingle();
    const ownerId = ownerMember?.user_id ?? null;

    for (const m of memberList) {
      const u = m.users as { name?: string; email?: string } | null;
      if (!u?.email) continue;

      try {
        await sb.from("notifications").insert({
          user_id: m.user_id,
          actor_id: null,
          kind: "daily_standup",
          title: "Good morning! What are you working on today?",
          body: `Balas di Sigap dengan plan harian kamu — 2-3 kalimat cukup. Misalnya: "Hari ini gue fokus X, blocked di Y, target kelar Z."\n\nJawaban kamu otomatis jadi team note, manager bisa liat konteksnya.`,
          link: "/dashboard",
        });

        if (ownerId) {
          try {
            await sendEmail(ownerId, {
              to: u.email,
              subject: "☀️ Async standup — apa plan kamu hari ini?",
              body: `Hi ${u.name || "there"},\n\nWaktu-nya async standup. Balas di Sigap (web atau Telegram) dengan plan harian kamu.\n\nContoh format:\n- Fokus utama: ...\n- Blocker: ...\n- Target selesai: ...\n\nJawabannya auto-save sebagai team note jadi tim bisa liat konteksnya.\n\n— Sigap`,
            });
          } catch {
            // email best-effort
          }
        }

        pinged++;
      } catch (e) {
        console.error(`standup ping failed for ${u.email}:`, e);
        errors++;
      }
    }
  }

  return NextResponse.json({ ok: true, pinged, errors, orgs: orgs.length });
}
