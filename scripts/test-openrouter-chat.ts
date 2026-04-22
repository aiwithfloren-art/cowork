/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildToolsForUser } from "../src/lib/llm/build-tools";

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
  const uid = user.id as string;

  const llm = await getLLMForUser(uid);
  console.log(`→ resolved: ${llm.provider} · ${llm.modelId}\n`);

  const tools = await buildToolsForUser(uid);
  console.log(`→ ${Object.keys(tools).length} tools loaded\n`);

  console.log("→ sending test chat...");
  const t0 = Date.now();
  const res = await generateText({
    model: llm.model,
    system: "You are Sigap. Reply in Bahasa Indonesia, keep it short.",
    messages: [
      { role: "user", content: "Halo, kamu pake model apa sekarang? Jawab singkat." },
    ],
  });
  console.log(`→ elapsed: ${Date.now() - t0}ms`);
  console.log(`→ reply: ${res.text}`);
  console.log(`→ usage: ${res.usage?.inputTokens} in, ${res.usage?.outputTokens} out`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
