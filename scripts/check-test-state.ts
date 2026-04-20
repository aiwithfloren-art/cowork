/* eslint-disable */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EMAILS = ["aiwithfloren@gmail.com", "humanevaluationofficial@gmail.com"];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const email of EMAILS) {
    console.log(`\n=== ${email} ===`);
    const { data: user } = await sb
      .from("users")
      .select("id, name, email, created_at")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      console.log("  ❌ NOT signed up yet");
      continue;
    }
    console.log(`  ✓ user: ${user.name} (${user.id})`);

    const { data: gtok } = await sb
      .from("google_tokens")
      .select("scope, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    console.log(`  ${gtok ? "✓" : "❌"} google_tokens: ${gtok ? gtok.scope : "MISSING"}`);

    const { data: conn } = await sb
      .from("connectors")
      .select("provider, external_account_label")
      .eq("user_id", user.id);
    console.log(`  connectors: ${(conn ?? []).map((c) => `${c.provider}(${c.external_account_label})`).join(", ") || "none"}`);

    const { data: mem } = await sb
      .from("org_members")
      .select("role, org_id, manager_id, share_with_manager")
      .eq("user_id", user.id);
    console.log(`  org_members: ${JSON.stringify(mem)}`);

    const { count: files } = await sb
      .from("user_files")
      .select("file_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    console.log(`  connected files: ${files}`);
  }
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
