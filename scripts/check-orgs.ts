/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const { data: orgs } = await sb
    .from("organizations")
    .select("id, name, owner_id, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("10 most recent orgs:", JSON.stringify(orgs, null, 2));

  const { data: recent, error, count } = await sb
    .from("org_invites")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\norg_invites count:", count, "error:", error?.message);
  console.log("10 most recent invites in DB:", JSON.stringify(recent, null, 2));

  if (orgs?.[0]?.id) {
    const { data: members } = await sb
      .from("org_members")
      .select("user_id, role, users:user_id(email, name)")
      .eq("org_id", orgs[0].id);
    console.log("\nmembers of", orgs[0].name + ":", JSON.stringify(members, null, 2));
  }
})();
