/* eslint-disable */
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

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
  console.log("✓ connected");

  await client.query(
    `alter table public.organizations add column if not exists description text;`,
  );
  console.log("✓ organizations.description");

  await client.query(
    `alter table public.organizations add column if not exists brand_tone text;`,
  );
  console.log("✓ organizations.brand_tone");

  await client.query(
    `alter table public.organizations add column if not exists websites text[] default '{}'::text[];`,
  );
  console.log("✓ organizations.websites");

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
