/* eslint-disable */
// Enable Supabase Realtime on tables the app subscribes to.
// Run: npx tsx scripts/enable-realtime.ts

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) throw new Error("Could not derive project ref");

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

  const tables = ["org_members", "audit_log", "notifications"];
  for (const t of tables) {
    try {
      await client.query(`alter publication supabase_realtime add table public.${t};`);
      console.log(`✓ realtime enabled on ${t}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already member")) {
        console.log(`• ${t} already in publication`);
      } else {
        console.error(`✗ ${t}:`, msg);
      }
    }
  }

  await client.end();
  console.log("🎉 done");
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
