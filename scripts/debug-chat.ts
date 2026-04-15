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

  const { rows } = await client.query(
    `select role, left(content, 200) as preview, tool_calls, created_at
     from public.chat_messages
     order by created_at desc
     limit 10`,
  );
  console.log("\n=== last 10 chat messages ===");
  for (const r of rows) {
    console.log(`\n[${r.created_at}] ${r.role}:`);
    console.log("  content:", r.preview);
    if (r.tool_calls) console.log("  tool_calls:", JSON.stringify(r.tool_calls, null, 2));
  }

  await client.end();
}

main().catch(console.error);
