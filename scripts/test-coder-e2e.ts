/* eslint-disable */
// Diagnostic: dry-run the Coder agent flow end-to-end with MOCKED tool
// execution. Measures time per step and verifies the LLM stays within
// the 4-call execute budget. No real GitHub repos, no Vercel deploys,
// no cost beyond a few LLM turns.
//
// Run: npx tsx scripts/test-coder-e2e.ts [user-email]

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getLLMForAgent } from "../src/lib/llm/providers";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

const EMAIL = process.argv[2] || "pramonolab@gmail.com";

// Messages that simulate the user's confirmed-spec moment. The Coder
// already went through clarify + summary in prior turns — here we jump
// straight to "boleh" which is where the big execute turn begins.
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
• Stack: Next.js 16 App Router + Tailwind + Lucide icons (modern, fast)
• Fitur: hero (tagline, CTA), services showcase, pricing tiers (3 plans), testimonial carousel, contact form, IG feed static gallery
• Tone: premium (dark palette, elegant fonts, minimal whitespace)
• Deploy: GitHub repo baru, deploy ke Vercel subdomain (custom domain bisa nanti)

Confirm atau ada yang mau diubah?`,
  },
  { role: "user" as const, content: "boleh" },
];

type Log = {
  step: number;
  elapsedMs: number;
  toolCalls: string[];
  text: string;
};

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

  console.log(`\n=== Coder E2E diagnostic ===`);
  console.log(`User: ${EMAIL}`);
  console.log(
    `Agent: ${coder.name} (${coder.llm_override_provider ?? "default"}/${coder.llm_override_model ?? "default"})`,
  );
  console.log(`Enabled tools: ${coder.enabled_tools.length}`);
  console.log(`System prompt: ${coder.system_prompt.length} chars`);

  const llm = await getLLMForAgent(user.id, coder);
  console.log(`Resolved model: ${llm.modelId} (${llm.provider})\n`);

  // ---- Build mock tools matching Coder's enabled list ----
  const mocks: Record<string, () => unknown> = {
    github_list_repos: () => ({
      ok: true,
      repos: [{ name: "existing-repo", updated_at: "2026-04-20T10:00:00Z" }],
    }),
    github_create_repo: () => ({
      ok: true,
      full_name: "test-user/aurora-landing",
      url: "https://github.com/test-user/aurora-landing",
    }),
    github_write_file: () => ({ ok: true, sha: "abc123" }),
    github_write_files_batch: () => ({
      ok: true,
      files_written: 15,
      commit_sha: "def456",
    }),
    github_read_file: () => ({ ok: true, content: "// mock file contents" }),
    http_request: () => ({
      ok: true,
      status: 200,
      body: { id: "dpl_mock123", url: "aurora-landing-abc.vercel.app" },
    }),
    get_credential: () => ({ ok: true, token: "mock_token_value" }),
    list_credentials: () => ({ ok: true, services: ["vercel", "github"] }),
    save_credential: () => ({ ok: true }),
    schedule_deploy_watcher: () => ({
      ok: true,
      watcher_id: "bw_mock",
      message: "Watcher queued",
    }),
    web_search: () => ({
      ok: true,
      results: [{ title: "mock result", url: "https://example.com" }],
    }),
    save_note: () => ({ ok: true, id: "note_mock" }),
    get_notes: () => ({ ok: true, notes: [] }),
    create_google_doc: () => ({
      ok: true,
      url: "https://docs.google.com/mock",
    }),
    create_artifact: () => ({ ok: true, id: "art_mock" }),
    github_list_commits: () => ({ ok: true, commits: [] }),
    github_get_commit_diff: () => ({ ok: true, diff: "" }),
    github_create_pr: () => ({
      ok: true,
      number: 1,
      url: "https://github.com/x/y/pull/1",
    }),
    github_list_open_prs: () => ({ ok: true, prs: [] }),
    github_comment_on_pr: () => ({ ok: true }),
  };

  // Wrap every tool with a stub. We import the real tools so schemas
  // (which OpenAI validates strictly) are preserved verbatim, then
  // replace only the execute() callback with a mock so there are no
  // real side effects.
  const { buildToolsForUser } = await import("../src/lib/llm/build-tools");
  const realTools = (await buildToolsForUser(user.id)) as Record<string, any>;

  const tools: Record<string, any> = {};
  for (const name of coder.enabled_tools as string[]) {
    const real = realTools[name];
    if (!real) {
      console.warn(`  ⚠️  tool ${name} not found in real tool registry, skipping`);
      continue;
    }
    const mockFn = mocks[name] ?? (() => ({ ok: true, note: "generic mock" }));
    tools[name] = tool({
      description: real.description,
      inputSchema: real.inputSchema,
      execute: async (args: unknown) => {
        const ts = Date.now();
        const result = mockFn();
        console.log(
          `  🔧 ${name} called (args: ${JSON.stringify(args).slice(0, 120)}) → mocked ${Date.now() - ts}ms`,
        );
        return result;
      },
    });
  }

  console.log(`Mocked ${Object.keys(tools).length} tools.\n`);
  console.log(`User sends: "${SIMULATED_HISTORY[SIMULATED_HISTORY.length - 1].content}"\n`);

  const start = Date.now();
  let stepIdx = 0;
  const logs: Log[] = [];

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
        console.log(`  ⏱  step ${stepIdx} starting @ ${elapsed}ms`);
        return { messages: stripReasoningFromMessages(messages) };
      },
    });

    const totalMs = Date.now() - start;
    const toolCallNames = (result.steps ?? [])
      .flatMap((s: any) => s.toolCalls ?? [])
      .map((tc: any) => tc.toolName);

    console.log(`\n=== RESULT ===`);
    console.log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`Steps: ${result.steps?.length ?? 0} (cap: 8)`);
    console.log(`Tool calls (${toolCallNames.length}): ${toolCallNames.join(", ")}`);
    console.log(`Tokens in: ${result.usage?.inputTokens ?? 0}`);
    console.log(`Tokens out: ${result.usage?.outputTokens ?? 0}`);
    console.log(`Finish: ${result.finishReason}\n`);
    console.log(`--- Assistant reply ---\n${result.text}\n`);

    // Verdict
    console.log(`=== VERDICT ===`);
    const pass =
      totalMs < 280000 &&
      toolCallNames.length <= 5 &&
      result.text.trim().length > 20;
    if (pass) {
      console.log(
        `✅ PASS — finished in ${(totalMs / 1000).toFixed(1)}s with ${toolCallNames.length} tool calls. Well under 300s budget.`,
      );
    } else {
      console.log(`❌ FAIL`);
      if (totalMs >= 280000)
        console.log(`  · Too slow: ${(totalMs / 1000).toFixed(1)}s >= 280s`);
      if (toolCallNames.length > 5)
        console.log(`  · Too many tool calls: ${toolCallNames.length} > 5`);
      if (!result.text || result.text.trim().length <= 20)
        console.log(`  · Empty/trivial reply`);
    }
  } catch (e) {
    const ms = Date.now() - start;
    console.error(`\n❌ ERROR after ${(ms / 1000).toFixed(1)}s:`, e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
