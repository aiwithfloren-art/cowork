/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText, stepCountIs } from "ai";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildToolsForUser } from "../src/lib/llm/build-tools";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

/**
 * Runs the REAL LLM flow against 10+ phrasing variants for agent
 * create/edit/delete. Verifies the LLM routes to the right tool for each.
 * Cleans up created agents after each run so the DB stays clean.
 *
 * Mirrors what happens in /api/chat minus the streaming + DB-log steps.
 */

const SYSTEM = `You are Sigap, a personal AI Chief of Staff for productivity work.

RULES:
- When user wants to create/add an AI employee or agent (any phrasing, any typo, Indonesian suffixes like "buatkan/bikinin/bantuin", English plurals like "employees/agents"), call create_ai_employee. Extract name, emoji, description, role_description, enabled_tools from their message. Ask clarifying questions ONLY if required info is missing.
- When user wants to edit an existing agent, call edit_ai_employee.
- When user wants to delete/fire/remove an agent, call delete_agent.
- Reply in user's language.`;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user missing");
  const userId = user.id as string;

  const llm = await getLLMForUser(userId);
  const tools = await buildToolsForUser(userId);

  const cases: Array<{
    label: string;
    message: string;
    expectTool: string;
  }> = [
    {
      label: "user's exact phrase (Indonesian + plural + suffix)",
      message:
        "buatkan 1 ai employees yang khusus untuk generate linkedin post everyday berdasarkan viral news berkaitan company kita, soft selling, namanya LinkedIn Writer, tone casual professional Indonesian",
      expectTool: "create_ai_employee",
    },
    {
      label: "plain 'bikin agent'",
      message:
        "bikin agent HR yang bantu onboarding + remind manager, namanya Dina",
      expectTool: "create_ai_employee",
    },
    {
      label: "English plural + create",
      message:
        "create an ai employee called Marcus for sales follow-up — draft cold emails, track pipeline, tone confident but not pushy",
      expectTool: "create_ai_employee",
    },
    {
      label: "typo 'bkin'",
      message:
        "bkin agen yg bantu review code dari GitHub namanya CodeReview, tone analytical",
      expectTool: "create_ai_employee",
    },
    {
      label: "'butuh' + 'asisten'",
      message:
        "butuh asisten buat bantu analisis data Q2 dari sheets, tone objective, namanya Analyst",
      expectTool: "create_ai_employee",
    },
    {
      label: "Edit existing agent",
      message:
        "edit Luna, tambahin generate_carousel_html ke tools-nya",
      expectTool: "edit_ai_employee",
    },
    {
      label: "Fuzzy delete",
      message: "hapus agent LinkedIn Writer yang barusan dibuat",
      expectTool: "delete_agent",
    },
    {
      label: "Non-intent (should NOT call any agent tool)",
      message: "apa schedule gue hari ini?",
      expectTool: "(none)",
    },
  ];

  const createdSlugs: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    console.log(`\n── ${c.label} ──`);
    console.log(`  msg: ${c.message.slice(0, 80)}${c.message.length > 80 ? "…" : ""}`);
    const t0 = Date.now();
    try {
      const result = await generateText({
        model: llm.model,
        system: SYSTEM,
        messages: [{ role: "user", content: c.message }],
        tools,
        stopWhen: stepCountIs(3),
        prepareStep: async ({ messages }) => ({
          messages: stripReasoningFromMessages(messages),
        }),
      });
      const ms = Date.now() - t0;
      const called = (result.steps ?? [])
        .flatMap((s: { toolCalls?: Array<{ toolName?: string }> }) => s.toolCalls ?? [])
        .map((tc) => tc.toolName ?? "")
        .filter(Boolean);

      // Track created agent slugs for cleanup
      for (const s of result.steps ?? []) {
        for (const r of (s as { toolResults?: Array<{ output?: { slug?: string; deleted_slug?: string } }> })
          .toolResults ?? []) {
          const out = r.output as { slug?: string } | undefined;
          if (out?.slug && called.includes("create_ai_employee")) {
            createdSlugs.push(out.slug);
          }
        }
      }

      const ok =
        c.expectTool === "(none)"
          ? called.length === 0
          : called.includes(c.expectTool);
      console.log(`  called: [${called.join(", ") || "(none)"}] · ${ms}ms`);
      if (ok) {
        console.log(`  ✓ expected ${c.expectTool}`);
        passed++;
      } else {
        console.log(`  ✗ expected ${c.expectTool}, got [${called.join(", ") || "(none)"}]`);
        console.log(`    reply: ${result.text?.slice(0, 200)}…`);
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ LLM error: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // Cleanup: remove any agents we accidentally created
  for (const slug of createdSlugs) {
    await sb
      .from("custom_agents")
      .delete()
      .eq("user_id", userId)
      .eq("slug", slug);
    console.log(`\ncleanup: deleted ${slug}`);
  }
  // Also clean test-like agents by name
  await sb
    .from("custom_agents")
    .delete()
    .eq("user_id", userId)
    .in("name", [
      "LinkedIn Writer",
      "Dina",
      "Marcus",
      "CodeReview",
      "Analyst",
    ]);

  console.log(`\n${passed}/${cases.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
