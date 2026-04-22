import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateText } from "ai";
import { getLLMForUser } from "@/lib/llm/providers";
import { loadPrimaryOrgContext, renderOrgContextBlock } from "@/lib/org-context";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * AI-assisted role description refinement. Takes the current role text +
 * the user's instruction (e.g. "make tone more formal", "add Twitter
 * thread support") and returns a proposed rewrite. The client shows a
 * diff-like preview before applying.
 *
 * Scoped to authenticated users only — we don't run LLM calls for
 * anonymous requests.
 */
export async function POST(req: Request) {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    current?: string;
    instruction?: string;
    agent_name?: string;
  };
  const current = (body.current ?? "").trim().slice(0, 4000);
  const instruction = (body.instruction ?? "").trim().slice(0, 1000);
  const agentName = (body.agent_name ?? "").trim().slice(0, 80) || "this agent";

  if (!instruction) {
    return NextResponse.json(
      { error: "Kasih instruksi apa yang mau diubah" },
      { status: 400 },
    );
  }

  const orgContextBlock = renderOrgContextBlock(
    await loadPrimaryOrgContext(uid),
  );

  const systemPrompt = `You are an expert AI prompt engineer. The user is editing the "role description" of an AI employee (sub-agent) in a productivity app. Your job: take the CURRENT role + an INSTRUCTION, and return a refined role description.

Rules for the rewrite:
- Keep the same core purpose unless the instruction explicitly asks to change it
- Match the user's original language (Indonesian → Indonesian, English → English)
- Use numbered lists for task breakdowns (1., 2., 3.) — easy for the agent to follow
- Keep it 3-8 lines, concise. Role descriptions that are too long confuse the model.
- Always end with tone/boundary guidance ("Tone: X. Hindari Y.")
- Don't include generic AI disclaimers like "I'll try my best" — agents just DO the work
- If the user's company context is provided below, weave relevant specifics in (e.g. mention the company's brand tone if the instruction touches voice/style)${orgContextBlock}

Output FORMAT — return ONLY the refined role description as plain text. No preamble, no markdown fences, no commentary. Just the new role.

Agent name: ${agentName}

If the instruction asks for something impossible or out of scope, output the current role unchanged + prepend a single line: "// Skipped: <reason>"`;

  try {
    const llm = await getLLMForUser(uid);
    const result = await generateText({
      model: llm.model,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `=== CURRENT ROLE ===
${current || "(empty — user is starting fresh)"}
=== END CURRENT ROLE ===

Instruction: ${instruction}`,
        },
      ],
    });

    const proposal = result.text.trim();
    if (!proposal) {
      return NextResponse.json(
        { error: "AI returned empty response — coba instruksi lain" },
        { status: 500 },
      );
    }
    return NextResponse.json({ proposal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Polish failed";
    console.error("[polish-role] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
