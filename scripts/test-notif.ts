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

  const TARGET = "aiwithfloren@gmail.com";
  const ACTOR = "humanevaluationofficial@gmail.com";

  const {
    rows: [target],
  } = await client.query("select id, name from public.users where email = $1", [TARGET]);
  const {
    rows: [actor],
  } = await client.query("select id, name from public.users where email = $1", [ACTOR]);

  if (!target || !actor) throw new Error("users not found");

  const { rows } = await client.query(
    `insert into public.notifications (user_id, actor_id, kind, title, body, link)
     values ($1, $2, 'task_assigned', $3, $4, '/dashboard')
     returning id, created_at`,
    [
      target.id,
      actor.id,
      `${actor.name || "Manager"} assigned you a task`,
      `Review proposal Acme — deadline 2026-04-17\n\nFokus di legal terms section.`,
    ],
  );

  console.log("✓ test notification inserted:", rows[0]);
  console.log(`  recipient: ${target.name} (${TARGET})`);
  console.log(`  actor:     ${actor.name} (${ACTOR})`);

  await client.end();
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
