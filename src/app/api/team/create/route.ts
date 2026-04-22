import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seedStarterSkills } from "@/lib/starter-kit";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = (await req.json()) as { name: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    crypto.randomBytes(3).toString("hex");

  const sb = supabaseAdmin();
  const { data: org, error } = await sb
    .from("organizations")
    .insert({ name: name.trim(), slug, owner_id: uid })
    .select("id")
    .single();

  if (error || !org) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }

  await sb.from("org_members").insert({
    org_id: org.id,
    user_id: uid,
    role: "owner",
    share_with_manager: true,
  });

  // Seed the Skill Hub with 4 starter templates so the new team sees a live
  // catalog from day 1 instead of an empty state. Best-effort — org
  // creation succeeds even if seeding fails.
  try {
    await seedStarterSkills(org.id);
  } catch (e) {
    console.error(
      "[team/create] starter-kit seed failed:",
      e instanceof Error ? e.message : e,
    );
  }

  return NextResponse.json({ ok: true, org_id: org.id });
}
