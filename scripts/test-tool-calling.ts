/* eslint-disable */
// Test which Groq-hosted model handles our tool schemas best.
// Run: npx tsx scripts/test-tool-calling.ts

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const MODELS = [
  "llama-3.3-70b-versatile",
  "moonshotai/kimi-k2-instruct-0905",
  "moonshotai/kimi-k2-instruct",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
];

const PROMPT = "Cariin slot 30 menit untuk deep work";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "find_meeting_slots",
      description:
        "Find open time slots for a meeting in the user's calendar during workday hours (09:00-18:00 Mon-Fri). Optionally include teammate emails to find SHARED free slots. Returns up to 5 slots.",
      parameters: {
        type: "object",
        properties: {
          duration_minutes: {
            type: "number",
            description: "Duration of the meeting in minutes (e.g. 30, 60)",
          },
          days_ahead: {
            type: ["number", "null"],
            description: "How many days to search ahead (default 7)",
          },
          with_emails: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Optional teammate emails to cross-reference",
          },
        },
        required: ["duration_minutes"],
        additionalProperties: false,
      },
    },
  },
];

async function test(model: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Default timezone is Asia/Jakarta.",
        },
        { role: "user", content: PROMPT },
      ],
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 500,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { model, ok: false, detail: JSON.stringify(data).slice(0, 200) };
  }

  const choice = data.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return {
      model,
      ok: false,
      detail: `No tool calls. Content: ${(choice?.message?.content || "").slice(0, 100)}`,
    };
  }

  const call = toolCalls[0];
  try {
    const args = JSON.parse(call.function.arguments);
    return {
      model,
      ok: true,
      detail: `→ ${call.function.name}(${JSON.stringify(args)})`,
    };
  } catch (e) {
    return {
      model,
      ok: false,
      detail: `Bad JSON args: ${call.function.arguments.slice(0, 100)}`,
    };
  }
}

async function main() {
  console.log(`\nTesting tool-call schema across ${MODELS.length} Groq models`);
  console.log(`Prompt: "${PROMPT}"\n`);
  for (const model of MODELS) {
    try {
      const r = await test(model);
      const icon = r.ok ? "✓" : "✗";
      console.log(`${icon} ${model.padEnd(50)} ${r.detail}`);
    } catch (e) {
      console.log(`✗ ${model.padEnd(50)} ERROR: ${(e as Error).message}`);
    }
  }
  console.log("");
}

main();
