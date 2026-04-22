/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const apiKeySet = Boolean(process.env.OPENROUTER_API_KEY);
  console.log(`OPENROUTER_API_KEY: ${apiKeySet ? "✓ set" : "✗ NOT set"}\n`);

  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user missing");

  const { data: agents } = await sb
    .from("custom_agents")
    .select("slug, name, emoji, enabled_tools")
    .eq("user_id", user.id);

  console.log(
    `Your ${(agents ?? []).length} activated agents:\n` +
      (agents ?? [])
        .map((a) => {
          const tools = (a.enabled_tools as string[]) ?? [];
          const hasGen = tools.includes("generate_image");
          return `  ${a.emoji ?? "🤖"} ${a.name}  ${hasGen ? "✓ generate_image" : "✗ no generate_image"}`;
        })
        .join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
