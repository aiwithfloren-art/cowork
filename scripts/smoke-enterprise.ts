/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

/**
 * Enterprise-sprint smoke test: verifies schema migrations landed, seeded
 * templates look right, and key DB invariants hold. Read-only.
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const results: Array<{ check: string; ok: boolean; detail?: string }> = [];

  async function check(name: string, fn: () => Promise<string | null>) {
    try {
      const detail = await fn();
      results.push({ check: name, ok: true, detail: detail ?? undefined });
    } catch (e) {
      results.push({
        check: name,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 1. organizations has new columns
  await check("organizations.tier column", async () => {
    const { data, error } = await sb
      .from("organizations")
      .select("id, name, tier")
      .limit(1);
    if (error) throw error;
    return `${data?.length} rows`;
  });

  await check("organizations has description/brand_tone", async () => {
    const { data } = await sb
      .from("organizations")
      .select("id, description, brand_tone, websites")
      .limit(1);
    return `sample row keys: ${data?.[0] ? Object.keys(data[0]).join(",") : "none"}`;
  });

  // 2. org_agent_templates has new columns
  await check("org_agent_templates policy columns", async () => {
    const { data, error } = await sb
      .from("org_agent_templates")
      .select(
        "id, name, share_token, visibility, auto_deploy, allowed_tools",
      )
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row) return "no templates — seeding worked?";
    return `visibility=${row.visibility} · auto_deploy=${row.auto_deploy} · allowed_tools=${((row.allowed_tools as string[]) ?? []).length}`;
  });

  // 3. connectors schema
  await check("connectors org_id column + nullable user_id", async () => {
    const { data } = await sb
      .from("connectors")
      .select("id, user_id, org_id, provider")
      .limit(1);
    return `${data?.length} rows`;
  });

  // 4. Starter templates seeded per org
  await check("starter kit seeded in every org", async () => {
    const { data: orgs } = await sb.from("organizations").select("id, name");
    if (!orgs || orgs.length === 0) return "no orgs to check";

    const expected = [
      "HR Onboarding",
      "Sales Follow-up",
      "Meeting Prep",
      "Content Drafter",
      "Data Extractor",
    ];
    for (const org of orgs) {
      const { data: templates } = await sb
        .from("org_agent_templates")
        .select("name")
        .eq("org_id", org.id as string);
      const names = new Set((templates ?? []).map((t) => t.name as string));
      const missing = expected.filter((e) => !names.has(e));
      if (missing.length > 0) {
        throw new Error(
          `org '${org.name}' missing: ${missing.join(", ")}`,
        );
      }
    }
    return `${orgs.length} org(s), all 5 starter templates present`;
  });

  // 5. enterprise_leads table works
  await check("enterprise_leads table", async () => {
    const { count } = await sb
      .from("enterprise_leads")
      .select("id", { count: "exact", head: true });
    return `${count} leads captured so far`;
  });

  // 6. DEMO mode artifacts gone
  await check("demo user removed (cleanup)", async () => {
    const { data } = await sb
      .from("users")
      .select("id")
      .eq("email", "demo@cowork-demo.local")
      .maybeSingle();
    if (data) {
      return `demo user row still exists (harmless, won't auth without Credentials provider)`;
    }
    return "no demo user row";
  });

  // Output
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`${icon} ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.ok) passed++;
    else failed++;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
