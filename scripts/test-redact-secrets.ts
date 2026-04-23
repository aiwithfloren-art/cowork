/* eslint-disable */
import {
  redactSecrets,
  redactByPatterns,
  extractSavedTokens,
} from "../src/lib/security/redact-secrets";

function check(name: string, actual: string, expected: string) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// 1. OpenAI prefix
check(
  "openai",
  redactByPatterns("my key is sk-proj-abc123def456ghi789jkl012mno").redacted,
  "my key is [redacted]",
);

// 2. Anthropic
check(
  "anthropic",
  redactByPatterns(
    "use sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa here",
  ).redacted,
  "use [redacted] here",
);

// 3. GitHub PAT
check(
  "github",
  redactByPatterns("token ghp_aaaaaaaaaaaaaaaaaaaaaa").redacted,
  "token [redacted]",
);

// 4. Stripe live — construct literal at runtime so GitHub's secret
// scanner doesn't flag this source file.
const stripeFake = "sk_" + "live_" + "a".repeat(30);
check(
  "stripe",
  redactByPatterns(`${stripeFake} end`).redacted,
  "[redacted] end",
);

// 5. JWT
check(
  "jwt",
  redactByPatterns("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturePart")
    .redacted,
  "[redacted]",
);

// 6. Composio
check(
  "composio ak_",
  redactByPatterns("platform key ak_luETlrNR3lTmYCn9vTuV").redacted,
  "platform key [redacted]",
);

// 7. Prefix-less Vercel via exact match
check(
  "vercel exact",
  redactSecrets("save vercel token: abc123XYZrandom456token", [
    "abc123XYZrandom456token",
  ]).redacted,
  "save vercel token: [redacted]",
);

// 8. No false positive on random text
const r8 = redactByPatterns("normal sentence with no tokens here").redacted;
check(
  "no false positive",
  r8,
  "normal sentence with no tokens here",
);

// 9. Multiple tokens in one message
check(
  "multiple",
  redactByPatterns("here ghp_aaaaaaaaaaaaaaaaaaaa and sk-proj-bbbbbbbbbbbbbbbbbbbb").redacted,
  "here [redacted] and [redacted]",
);

// 10. extractSavedTokens
const extracted = extractSavedTokens([
  {
    toolCalls: [
      { toolName: "save_credential", input: { token: "abc12345" } },
      { toolName: "something_else", input: { token: "should-not-extract" } },
    ],
  },
  {
    toolCalls: [{ toolName: "save_credential", input: { token: "xyz67890" } }],
  },
]);
check(
  "extract saved tokens",
  JSON.stringify(extracted),
  JSON.stringify(["abc12345", "xyz67890"]),
);

console.log("\ndone");
