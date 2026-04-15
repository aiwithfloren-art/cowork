/* eslint-disable */
// One-off: add `type` column to notes table.
// Run: npx tsx scripts/alter-notes-type.ts

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) throw new Error("Could not derive project ref from SUPABASE_URL");

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

  await client.query(`
    alter table public.notes
      add column if not exists type text default 'general'
      check (type in ('general', 'user', 'feedback', 'project', 'reference'));
  `);
  console.log("✓ column added");

  const { rows } = await client.query(
    "select column_name, data_type, column_default from information_schema.columns where table_name='notes' and column_name='type'",
  );
  console.log("verify:", rows);

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
