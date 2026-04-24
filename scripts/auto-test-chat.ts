/* eslint-disable */
// End-to-end chat test that calls generateText with the SAME model + tools
// as /api/chat/route.ts. Runs N scenarios, detects tool call failures,
// empty responses, and API-level errors. Reports per-scenario status.
//
// Usage: npx tsx scripts/auto-test-chat.ts [email]

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { generateText, stepCountIs } from "ai";
import { getLLMForUser } from "../src/lib/llm/providers";
import { buildToolsForUser } from "../src/lib/llm/build-tools";
import { stripReasoningFromMessages } from "../src/lib/llm/strip-reasoning";

const EMAIL = process.argv[2] || "aiwithfloren@gmail.com";

type Scenario = {
  name: string;
  prompt: string;
  expectTools?: string[]; // at least one of these must fire
  mustNotError?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    name: "basic_greeting",
    prompt: "halo",
    mustNotError: true,
  },
  {
    name: "calendar_today",
    prompt: "apa jadwal saya hari ini",
    expectTools: ["get_today_schedule"],
  },
  {
    name: "calendar_week",
    prompt: "jadwal minggu ini gimana",
    expectTools: ["get_week_schedule"],
  },
  {
    name: "tasks_list",
    prompt: "tugas apa aja yang belum selesai",
    expectTools: ["list_tasks"],
  },
  {
    name: "tasks_add",
    prompt: "tambah task: tes dari auto-test, deadline besok",
    expectTools: ["add_task"],
  },
  {
    name: "email_list",
    prompt: "liat email saya yang terbaru",
    expectTools: ["list_recent_emails"],
  },
  {
    name: "files_list",
    prompt: "file apa aja yang saya connect",
    expectTools: ["list_connected_files"],
  },
  {
    name: "notes_get",
    prompt: "notes apa yang saya punya",
    expectTools: ["get_notes"],
  },
  {
    name: "team_list",
    prompt: "siapa anggota tim saya",
    expectTools: ["list_team_members"],
  },
  {
    name: "web_search",
    prompt: "cari berita terbaru tentang AI 2026",
    expectTools: ["web_search"],
  },
  {
    name: "slack_channels",
    prompt: "channel slack apa aja yang ada",
    expectTools: ["list_slack_channels"],
  },
  {
    name: "delegate_to_budi",
    prompt:
      "kasih task ke humanevaluationofficial@gmail.com: review proposal, deadline besok",
    expectTools: ["assign_task_to_member"],
  },
  {
    name: "share_drive_no_files",
    // When no files are connected, the correct behavior is to call
    // list_connected_files first (to verify) and report "not found",
    // rather than blindly invoking share_drive_file. Accept either.
    prompt: "share folder Proposal Q1 ke budi@example.com kasih view",
    expectTools: ["share_drive_file", "list_connected_files"],
  },
];

type ResultRow = {
  name: string;
  ok: boolean;
  tools: string[];
  detail: string;
  responseText: string;
};

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
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
  const userId = user.id;
  console.log(`Testing as ${EMAIL} (${userId.slice(0, 8)}…)`);

  const llm = await getLLMForUser(userId);
  console.log(`Model: ${llm.modelId} (${llm.provider})\n`);
  const tools = await buildToolsForUser(userId);
  console.log(`Tools loaded: ${Object.keys(tools).length}\n`);

  const results: ResultRow[] = [];

  for (const s of SCENARIOS) {
    process.stdout.write(`[${s.name}] "${s.prompt.slice(0, 40)}..." `);
    const row: ResultRow = {
      name: s.name,
      ok: false,
      tools: [],
      detail: "",
      responseText: "",
    };
    try {
      const result = await generateText({
        model: llm.model,
        system:
          "You are Sigap. Use tools to answer. Reply briefly in the user's language. Today is 2026-04-20 WIB.",
        messages: [{ role: "user", content: s.prompt }],
        tools,
        stopWhen: stepCountIs(4),
        prepareStep: async ({ messages }) => ({
          messages: stripReasoningFromMessages(messages),
        }),
      });

      const toolsCalled = (result.steps ?? [])
        .flatMap((step: { toolCalls?: Array<{ toolName?: string }> }) => step.toolCalls ?? [])
        .map((tc) => tc.toolName)
        .filter((n): n is string => !!n);
      row.tools = toolsCalled;
      row.responseText = (result.text || "").slice(0, 200);

      const wantedTools = s.expectTools ?? [];
      const toolHit =
        wantedTools.length === 0 ||
        wantedTools.some((w) => toolsCalled.includes(w));

      if (!result.text && toolsCalled.length === 0) {
        row.detail = "EMPTY RESPONSE + NO TOOLS";
      } else if (wantedTools.length > 0 && !toolHit) {
        row.detail = `expected one of [${wantedTools.join(",")}], got [${toolsCalled.join(",") || "none"}]`;
      } else {
        row.ok = true;
        row.detail = `tools=[${toolsCalled.join(",") || "-"}]`;
      }
      console.log(row.ok ? `✓ ${row.detail}` : `✗ ${row.detail}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      row.detail = `ERROR: ${msg.slice(0, 200)}`;
      console.log(`✗ ${row.detail}`);
    }
    results.push(row);
  }

  console.log(`\n${"=".repeat(70)}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nRESULTS: ${passed}/${results.length} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.log("FAILURES:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
      if (r.responseText) {
        console.log(`    text: ${r.responseText.slice(0, 150)}`);
      }
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("crashed:", e);
  process.exit(1);
});
