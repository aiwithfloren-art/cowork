import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
import { Client } from "pg";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]!;
  const client = new Client({
    host: `db.${ref}.supabase.co`, port: 5432, database: "postgres",
    user: "postgres", password, ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Schema
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'connectors'
    ORDER BY ordinal_position
  `);
  console.log("COLUMNS:");
  cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(25)} ${r.data_type.padEnd(18)} null=${r.is_nullable}`));

  // Constraints + indexes
  const idx = await client.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='connectors'
  `);
  console.log("\nINDEXES:");
  idx.rows.forEach(r => console.log(`  ${r.indexname}\n    ${r.indexdef}`));

  const cons = await client.query(`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'public.connectors'::regclass
  `);
  console.log("\nCONSTRAINTS:");
  cons.rows.forEach(r => console.log(`  ${r.conname} (${r.contype})`));

  // Data for aiwithfloren
  const user = await client.query(`SELECT id FROM users WHERE email='pramonolab@gmail.com' LIMIT 1`);
  if (user.rows[0]) {
    const rows = await client.query(
      `SELECT provider, external_account_label, created_at, updated_at FROM connectors WHERE user_id=$1`,
      [user.rows[0].id],
    );
    console.log(`\nUSER rows (${user.rows[0].id}):`);
    rows.rows.forEach(r => console.log(`  ${r.provider} -> ${r.external_account_label} · updated ${r.updated_at}`));
  }

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
