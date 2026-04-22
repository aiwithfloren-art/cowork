/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { tryInterceptCompanyContext } from "../src/lib/llm/company-context-intercept";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("user not found");
  console.log(`→ user ${user.id}\n`);

  // Find the user's primary org and wipe its profile so we start clean.
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership?.org_id) {
    console.log("→ user has no org; creating one for the test");
    const { data: newOrg, error } = await sb
      .from("organizations")
      .insert({
        name: "Test Co",
        slug: `test-${Date.now()}`,
        owner_id: user.id,
      })
      .select("id")
      .single();
    if (error || !newOrg) throw new Error(`create org: ${error?.message}`);
    await sb.from("org_members").insert({
      org_id: newOrg.id,
      user_id: user.id,
      role: "owner",
    });
  }

  const { data: membership2 } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const orgId = membership2!.org_id;
  console.log(`→ org ${orgId}`);

  // Reset profile
  await sb
    .from("organizations")
    .update({ description: null, brand_tone: null, websites: [] })
    .eq("id", orgId);
  console.log("→ profile cleared\n");

  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];
  const turns = [
    "bikin PPT buat client Astra tentang roadmap Q2", // brand-task trigger
    "Kami Acme, startup logistik B2B buat UMKM di Indonesia. Fokus Q2 launch driver app.",
    "casual tapi professional, confident ga kaku",
    "acme.co.id",
  ];

  for (const input of turns) {
    console.log(`👤 USER: ${input}`);
    const t0 = Date.now();
    const reply = await tryInterceptCompanyContext(user.id, input, transcript);
    const ms = Date.now() - t0;
    if (!reply) {
      console.log(`  (intercept did not fire — fell through)\n`);
      break;
    }
    console.log(`🤖 SIGAP [${ms}ms]:\n${reply}\n`);
    transcript.push({ role: "user", content: input });
    transcript.push({ role: "assistant", content: reply });
  }

  console.log("\n→ final profile:");
  const { data: org } = await sb
    .from("organizations")
    .select("description, brand_tone, websites")
    .eq("id", orgId)
    .maybeSingle();
  console.log(JSON.stringify(org, null, 2));

  // ========= Role-check test: demote to member, wipe profile, retry =========
  console.log("\n─── role-check: as member ───");
  await sb
    .from("organizations")
    .update({ description: null, brand_tone: null, websites: [] })
    .eq("id", orgId);
  await sb
    .from("org_members")
    .update({ role: "member" })
    .eq("org_id", orgId)
    .eq("user_id", user.id);

  const memberReply = await tryInterceptCompanyContext(
    user.id,
    "bikin PPT buat client",
    [],
  );
  console.log(`🤖 ${memberReply}\n`);

  const { data: afterMember } = await sb
    .from("organizations")
    .select("description, brand_tone, websites")
    .eq("id", orgId)
    .maybeSingle();
  console.log("profile after member attempt:", JSON.stringify(afterMember));
  if (afterMember?.description === null && afterMember?.brand_tone === null) {
    console.log("✓ member did NOT write to DB");
  } else {
    console.log("✗ member WROTE to DB — bug");
  }

  // Restore owner role for cleanup
  await sb
    .from("org_members")
    .update({ role: "owner" })
    .eq("org_id", orgId)
    .eq("user_id", user.id);
}

main().catch((e) => {
  console.error("CRASH:", e.message);
  console.error(e.stack);
  process.exit(1);
});
