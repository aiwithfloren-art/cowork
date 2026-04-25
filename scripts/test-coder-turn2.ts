/* eslint-disable */
// Diagnostic for Coder TURN 2 (user replies "lanjut" after Turn 1
// scaffold). Simulates the 2-turn split flow — Turn 2 should add
// feature components, trigger deploy, and schedule the watcher.
//
// Run: npx tsx scripts/test-coder-turn2.ts [user-email]

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getLLMForAgent } from "../src/lib/llm/providers";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

const EMAIL = process.argv[2] || "amandapontami@gmail.com";

// Full conversation: initial ask → clarify → user → summary → boleh →
// Turn 1 scaffold reply → user "lanjut" (this is the turn we're testing).
const SIMULATED_HISTORY = [
  {
    role: "user" as const,
    content:
      "buat landing page fashion brand, minimalist, hero + pricing + testimonial + instagram feed, stack next.js + tailwind",
  },
  {
    role: "assistant" as const,
    content: `Sebelum mulai, 3 Q dulu:
1. Nama brand + tagline?
2. Instagram handle?
3. 3 tier pricing-nya gimana?`,
  },
  {
    role: "user" as const,
    content:
      "Brand name: Aurora. Tagline: Elegance redefined. IG: @aurora.label. Pricing: Basic $29/pc, Signature $59/pc, Limited $129/pc.",
  },
  {
    role: "assistant" as const,
    content: `Ok paham. Rencana:
• Stack: Next.js 16 App Router + Tailwind + Lucide icons
• Fitur: hero, services showcase, pricing tiers, testimonial carousel, IG feed
• Tone: premium (dark palette, elegant fonts)
• Deploy: Vercel subdomain

Confirm atau ada yang mau diubah?`,
  },
  { role: "user" as const, content: "boleh" },
  {
    role: "assistant" as const,
    content: `✅ Scaffold pushed ke github.com/test-user/aurora-landing.
• Base app runnable, 5 files committed.

Reply **lanjut** buat gw tambahin section components (hero, pricing, testimonial, dll) + deploy ke Vercel.`,
  },
  { role: "user" as const, content: "lanjut" },
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", EMAIL)
    .maybeSingle();
  if (!user) {
    console.error(`user ${EMAIL} not found`);
    process.exit(1);
  }

  const { data: coder } = await sb
    .from("custom_agents")
    .select(
      "id, name, system_prompt, enabled_tools, llm_override_provider, llm_override_model",
    )
    .eq("user_id", user.id)
    .eq("name", "Coder")
    .maybeSingle();
  if (!coder) {
    console.error(`Coder agent not installed for ${EMAIL}`);
    process.exit(1);
  }

  console.log(`\n=== Coder TURN 2 diagnostic ===`);
  console.log(`User: ${EMAIL}`);
  console.log(`User reply: "lanjut"`);
  console.log(
    `Agent: ${coder.name} (${coder.llm_override_provider ?? "default"}/${coder.llm_override_model ?? "default"})`,
  );

  const llm = await getLLMForAgent(user.id, coder);
  console.log(`Resolved model: ${llm.modelId}\n`);

  const mocks: Record<string, () => unknown> = {
    github_create_repo: () => ({
      ok: true,
      full_name: "test-user/aurora-landing",
      url: "https://github.com/test-user/aurora-landing",
    }),
    github_write_file: () => ({ ok: true, sha: "abc123" }),
    github_write_files_batch: () => ({
      ok: true,
      commit_sha: "def456",
      html_url: "https://github.com/test-user/aurora-landing/commit/def456",
      files_count: 5,
      branch: "main",
    }),
    github_read_file: () => ({ ok: true, content: "// mock file contents" }),
    http_request: () => ({
      ok: true,
      status: 200,
      body: { id: "dpl_mock123", url: "aurora-landing-abc.vercel.app" },
    }),
    get_credential: () => ({ ok: true, token: "mock_vercel_token" }),
    list_credentials: () => ({ ok: true, services: ["vercel", "github"] }),
    save_credential: () => ({ ok: true }),
    schedule_deploy_watcher: () => ({
      ok: true,
      watcher_id: "bw_mock",
      message: "Watcher queued",
    }),
    web_search: () => ({ ok: true, results: [] }),
    save_note: () => ({ ok: true, id: "note_mock" }),
    get_notes: () => ({ ok: true, notes: [] }),
    create_google_doc: () => ({ ok: true, url: "https://docs.google.com/mock" }),
    create_artifact: () => ({ ok: true, id: "art_mock" }),
    github_list_repos: () => ({ ok: true, repos: [] }),
    github_list_commits: () => ({ ok: true, commits: [] }),
    github_get_commit_diff: () => ({ ok: true, diff: "" }),
    github_create_pr: () => ({ ok: true, number: 1 }),
    github_list_open_prs: () => ({ ok: true, prs: [] }),
    github_comment_on_pr: () => ({ ok: true }),
  };

  const { buildToolsForUser } = await import("../src/lib/llm/build-tools");
  const realTools = (await buildToolsForUser(user.id)) as Record<string, any>;

  const tools: Record<string, any> = {};
  for (const name of coder.enabled_tools as string[]) {
    const real = realTools[name];
    if (!real) continue;
    const mockFn = mocks[name] ?? (() => ({ ok: true, note: "generic mock" }));
    tools[name] = tool({
      description: real.description,
      inputSchema: real.inputSchema,
      execute: async (args: unknown) => {
        const result = mockFn();
        console.log(
          `  🔧 ${name} called (args: ${JSON.stringify(args).slice(0, 120)})`,
        );
        return result;
      },
    });
  }

  const start = Date.now();
  let stepIdx = 0;

  try {
    const result = await generateText({
      model: llm.model,
      system: coder.system_prompt,
      messages: SIMULATED_HISTORY,
      tools,
      stopWhen: stepCountIs(8),
      prepareStep: async ({ messages }) => {
        stepIdx++;
        const elapsed = Date.now() - start;
        console.log(`  ⏱  step ${stepIdx} @ ${elapsed}ms`);
        return { messages: stripReasoningFromMessages(messages) };
      },
    });

    const totalMs = Date.now() - start;
    const toolCallNames = (result.steps ?? [])
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((tc: any) => tc.toolName);

    console.log(`\n=== RESULT ===`);
    console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`Steps: ${result.steps?.length ?? 0}`);
    console.log(`Tool calls (${toolCallNames.length}): ${toolCallNames.join(", ")}`);
    console.log(`Tokens in/out: ${result.usage?.inputTokens ?? 0} / ${result.usage?.outputTokens ?? 0}`);
    console.log(`Finish: ${result.finishReason}\n`);
    console.log(`--- Assistant reply ---\n${result.text}\n`);

    const watcherCalled = toolCallNames.includes("schedule_deploy_watcher");
    const deployTriggered = toolCallNames.includes("http_request");

    console.log(`=== VERDICT ===`);
    const pass =
      totalMs < 280000 &&
      watcherCalled &&
      deployTriggered &&
      result.text.trim().length > 20;
    if (pass) {
      console.log(`✅ PASS — ${(totalMs / 1000).toFixed(1)}s, watcher called, deploy triggered.`);
    } else {
      console.log(`❌ FAIL`);
      if (totalMs >= 280000) console.log(`  · Too slow: ${(totalMs / 1000).toFixed(1)}s`);
      if (!deployTriggered) console.log(`  · http_request (deploy) NOT called`);
      if (!watcherCalled) console.log(`  · schedule_deploy_watcher NOT called (HALLUCINATION RISK)`);
      if (!result.text || result.text.trim().length <= 20) console.log(`  · Empty/trivial reply`);
    }
  } catch (e) {
    console.error(`\n❌ ERROR after ${(Date.now() - start) / 1000}s:`, e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
