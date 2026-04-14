import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";
import { headers } from "next/headers";
import { sendInviteEmail } from "@/lib/email/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, org_id, role } = (await req.json()) as {
    email: string;
    org_id: string;
    role?: string;
  };
  if (!email?.trim() || !org_id) {
    return NextResponse.json({ error: "email and org_id required" }, { status: 400 });
  }

  // Verify actor is manager/owner in this org
  const sb = supabaseAdmin();
  const { data: member } = await sb
    .from("org_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", uid)
    .maybeSingle();
  if (!member || (member.role !== "owner" && member.role !== "manager")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const { error } = await sb.from("org_invites").insert({
    org_id,
    email: email.trim().toLowerCase(),
    role: role || "member",
    manager_id: (role || "member") === "member" ? uid : null,
    token,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: inviter }, { data: org }] = await Promise.all([
    sb.from("users").select("name, email").eq("id", uid).maybeSingle(),
    sb.from("organizations").select("name").eq("id", org_id).maybeSingle(),
  ]);

  const h = await headers();
  const host = h.get("host") ?? "cowork-gilt.vercel.app";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const inviteUrl = `${proto}://${host}/invite/${token}`;

  await sendInviteEmail({
    to: email.trim().toLowerCase(),
    inviterName: inviter?.name || inviter?.email || "Someone",
    orgName: org?.name || "a team",
    inviteUrl,
  });

  return NextResponse.json({ ok: true });
}
