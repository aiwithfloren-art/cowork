/* eslint-disable */
// Reproduce the chat API call exactly via Vercel AI SDK to find which
// tool definition or model combo is breaking.

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateText, stepCountIs } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const groq = createOpenAICompatible({
  name: "groq",
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

// Use the REAL build tools from the app
import { buildTools } from "../src/lib/llm/tools";

const tools = buildTools("fcca50cc-1f32-4d65-b7b5-93b2d5f45f0a");

const MODELS_TO_TEST = [
  "moonshotai/kimi-k2-instruct-0905",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
];

async function test(model: string) {
  try {
    const result = await generateText({
      model: groq(model),
      system: "You are a helpful assistant. Default timezone Asia/Jakarta.",
      messages: [
        { role: "user", content: "Cariin slot 30 menit untuk deep work" },
      ],
      tools,
      stopWhen: stepCountIs(4),
    });

    return {
      model,
      ok: true,
      text: result.text || "(no text)",
      steps: result.steps?.length || 0,
      finishReason: result.finishReason,
    };
  } catch (e) {
    return {
      model,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  for (const model of MODELS_TO_TEST) {
    console.log(`\n=== ${model} ===`);
    const r = await test(model);
    if (r.ok) {
      console.log(`✓ steps=${r.steps} finish=${r.finishReason}`);
      console.log(`  text: ${(r.text ?? "").slice(0, 200)}`);
    } else {
      console.log(`✗ ERROR: ${r.error?.slice(0, 400)}`);
    }
  }
}

main();
