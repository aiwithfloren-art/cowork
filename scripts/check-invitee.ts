/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const INVITEE = "humanevaluationofficial@gmail.com";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: user } = await sb
    .from("users")
    .select("id, email, name, created_at")
    .eq("email", INVITEE)
    .maybeSingle();
  console.log("users row:", user || "NOT FOUND");

  const { data: invites } = await sb
    .from("org_invites")
    .select("org_id, email, role, accepted_at, created_at, token")
    .eq("email", INVITEE)
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("\nrecent invites to this email:", JSON.stringify(invites, null, 2));

  if (user) {
    const { data: notifs } = await sb
      .from("notifications")
      .select("kind, title, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    console.log("\nnotifications for this user:", JSON.stringify(notifs, null, 2));
  }
}

main();
