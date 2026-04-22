/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { seedStarterSkills } from "../src/lib/starter-kit";

/**
 * One-shot backfill: seed starter skills into every existing org that
 * doesn't already have them. Safe to re-run — seedStarterSkills is
 * idempotent per (org_id, name).
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: orgs } = await sb.from("organizations").select("id, name");
  if (!orgs || orgs.length === 0) {
    console.log("No orgs to backfill.");
    return;
  }

  console.log(`Backfilling ${orgs.length} org(s)…`);
  for (const org of orgs) {
    await seedStarterSkills(org.id as string);
    console.log(`  ✓ ${org.name}`);
  }
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
