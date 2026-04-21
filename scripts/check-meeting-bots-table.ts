/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
  const { data, error, count } = await sb
    .from("meeting_bots")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log("TABLE MISSING or error:", error.message);
    process.exit(1);
  }
  console.log(`✓ meeting_bots table exists (${count ?? 0} rows)`);
})();
