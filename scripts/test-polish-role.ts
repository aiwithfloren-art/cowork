/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { getLLMForUser } from "../src/lib/llm/providers";
import { loadPrimaryOrgContext, renderOrgContextBlock } from "../src/lib/org-context";

/**
 * Simulates the /api/agents/polish-role flow without HTTP — calls the
 * same LLM stack with the same system prompt to verify output quality.
 */
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

  const current = `Kamu adalah Content Drafter. Draft konten yang konsisten sama brand company:
1. Social media post (Twitter/LinkedIn/Instagram) — pilih format sesuai channel.
2. Caption yang punya hook + value + CTA.
3. Email marketing (nurture, announcement, newsletter) dengan tone yang pas.
4. Internal comms (announcement, Slack post, all-hands summary).

Selalu baca Company Context dulu buat tone + target customer. Jangan generic.
Output 2-3 variasi biar user bisa pilih. Format tiap variasi dengan label (A/B/C).`;

  const instruction = "Tambahin support buat generate carousel Instagram pake tool generate_carousel_html. Bikin lebih pendek juga.";

  const orgBlock = renderOrgContextBlock(await loadPrimaryOrgContext(user.id as string));
  const system = `You are an expert AI prompt engineer. The user is editing the "role description" of an AI employee (sub-agent) in a productivity app. Your job: take the CURRENT role + an INSTRUCTION, and return a refined role description.

Rules for the rewrite:
- Keep the same core purpose unless the instruction explicitly asks to change it
- Match the user's original language (Indonesian → Indonesian, English → English)
- Use numbered lists for task breakdowns (1., 2., 3.)
- Keep it 3-8 lines, concise
- Always end with tone/boundary guidance
- Don't include generic AI disclaimers
- If the user's company context is provided below, weave relevant specifics in${orgBlock}

Output FORMAT — return ONLY the refined role description as plain text. No preamble, no markdown fences, no commentary.

Agent name: Content Drafter`;

  const llm = await getLLMForUser(user.id as string);
  console.log(`→ calling LLM (provider=${llm.provider}, model=${llm.modelId})`);
  const t0 = Date.now();
  const res = await generateText({
    model: llm.model,
    system,
    messages: [
      {
        role: "user",
        content: `=== CURRENT ROLE ===\n${current}\n=== END CURRENT ROLE ===\n\nInstruction: ${instruction}`,
      },
    ],
  });
  console.log(`→ elapsed: ${Date.now() - t0}ms\n`);
  console.log("=== PROPOSAL ===");
  console.log(res.text.trim());
  console.log("=== END ===");
  console.log(`\n🎉 polish-role flow verified`);
}

main().catch((e) => { console.error(e); process.exit(1); });
