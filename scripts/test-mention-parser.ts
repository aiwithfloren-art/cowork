/* eslint-disable */
/**
 * Copy of the parseMention function in src/components/chat.tsx. Keep in
 * sync — if it drifts, update here. We can't import the client component
 * directly (pulls React + use client); cheapest is to mirror the regex.
 */
function parseMention(text: string): { slug: string; rest: string } | null {
  const trimmed = text.trimStart();
  const m = trimmed.match(/^@([a-z0-9][a-z0-9-]{0,50})\s+([\s\S]+)$/i);
  if (!m) return null;
  return { slug: m[1].toLowerCase(), rest: m[2].trim() };
}

function main() {
  let passed = 0;
  let failed = 0;

  function assertEq(label: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) {
      console.log(`  expected: ${JSON.stringify(expected)}`);
      console.log(`  actual:   ${JSON.stringify(actual)}`);
      failed++;
    } else {
      passed++;
    }
  }

  assertEq(
    "basic @amore mention",
    parseMention("@amore bikin caption"),
    { slug: "amore", rest: "bikin caption" },
  );

  assertEq(
    "@slug with dash",
    parseMention("@sales-follow-up draft email"),
    { slug: "sales-follow-up", rest: "draft email" },
  );

  assertEq(
    "leading whitespace",
    parseMention("  @amore hello"),
    { slug: "amore", rest: "hello" },
  );

  assertEq(
    "multiline rest is preserved",
    parseMention("@amore line1\nline2"),
    { slug: "amore", rest: "line1\nline2" },
  );

  assertEq(
    "no @ prefix → null",
    parseMention("hey amore"),
    null,
  );

  assertEq(
    "@ in middle → null (must be at start)",
    parseMention("hi @amore there"),
    null,
  );

  assertEq(
    "@name with no content → null (need a body)",
    parseMention("@amore"),
    null,
  );

  assertEq(
    "uppercase slug → lowercased",
    parseMention("@AMORE bikin caption"),
    { slug: "amore", rest: "bikin caption" },
  );

  assertEq(
    "email-ish '@acme.co' → null (dots not allowed in slug)",
    parseMention("@acme.co hi"),
    null,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
