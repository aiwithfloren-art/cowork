/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildTools } from "../src/lib/llm/tools";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("user missing");

  const llm = await getLLMForUser(user.id as string);
  console.log(
    `Chat LLM resolves to: provider=${llm.provider}, model=${llm.modelId}`,
  );

  const tools = buildTools(user.id as string);
  const gen = (tools as { generate_image?: { execute: Function } })
    .generate_image;
  console.log(
    `Image gen tool wired: ${gen ? "yes" : "no"}, OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY ? "set" : "MISSING"}`,
  );
  console.log(
    `Split config: chat=${llm.provider} · image=openrouter (independent)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
