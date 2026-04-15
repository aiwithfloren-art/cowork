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

  const { rows: notifs } = await client.query(
    `select n.id, n.title, n.created_at,
            recipient.email as recipient_email,
            actor.email as actor_email
     from public.notifications n
     left join public.users recipient on recipient.id = n.user_id
     left join public.users actor on actor.id = n.actor_id
     order by n.created_at desc limit 10`,
  );
  console.log("\n=== notifications (last 10) ===");
  console.table(notifs);

  const { rows: users } = await client.query(
    `select id, email, name from public.users order by created_at`,
  );
  console.log("\n=== users ===");
  console.table(users);

  await client.end();
}

main().catch(console.error);
