/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Per-agent LLM override — Coder/Reviewer should run DeepSeek V3.2
 * (coding specialist) even though the org default is Qwen3 (for Bahasa
 * natural user-facing chat). Same philosophy as enabled_tools override:
 *   provider/model > agent's override > org policy > user's BYOK > platform default
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]!;
  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // custom_agents — per-user activated agents
  await client.query(
    `alter table public.custom_agents add column if not exists llm_override_provider text;`,
  );
  await client.query(
    `alter table public.custom_agents add column if not exists llm_override_model text;`,
  );
  console.log("✓ custom_agents.llm_override_{provider,model}");

  // org_agent_templates — published templates users install from
  await client.query(
    `alter table public.org_agent_templates add column if not exists llm_override_provider text;`,
  );
  await client.query(
    `alter table public.org_agent_templates add column if not exists llm_override_model text;`,
  );
  await client.query(
    `alter table public.org_agent_templates add column if not exists default_schedule text;`,
  );
  console.log("✓ org_agent_templates.llm_override_{provider,model} + default_schedule");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
