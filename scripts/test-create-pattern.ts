/* eslint-disable */
/**
 * Matrix of user phrasings → should / should not match CREATE_PATTERN.
 * Keep in sync with agent-intercept.ts regex.
 */
const CREATE_PATTERN =
  /\b(bikin(?:in|kan|an)?|buat(?:kan|in)?|bantuin|create|make|generate|mau|pengen|pengin|punya|butuh|need|want|new|setup|add)\b[^.?!]{0,100}\b(ai\s+employees?|agents?|agen|employees?|sub[- ]?agents?|asisten(?:nya)?|assistants?)\b/i;

const cases: Array<{ text: string; expect: boolean; label: string }> = [
  {
    label: "user's exact phrase",
    text: "buatkan 1 ai employees yang khusus untuk bisa generate linkedin post everyday berdasarkan viral news yang berkaitan dengan our company jadi soft selling namanya (linkedin writer)",
    expect: true,
  },
  { label: "bikin agent", text: "bikin agent buat HR", expect: true },
  { label: "bikinin agent", text: "bikinin agent marketing", expect: true },
  { label: "bikinkan agent", text: "bikinkan agent sales", expect: true },
  { label: "buat agent", text: "buat agent HR", expect: true },
  { label: "buatin agent", text: "buatin agent content", expect: true },
  { label: "buatkan agent", text: "buatkan agent finance", expect: true },
  { label: "create employee", text: "create an ai employee for hr", expect: true },
  { label: "create agents (plural)", text: "create two agents please", expect: true },
  { label: "new employees (plural)", text: "need new employees", expect: true },
  { label: "generate sub-agent", text: "generate a sub-agent for me", expect: true },
  { label: "mau asisten", text: "mau asisten buat customer support", expect: true },
  { label: "asistennya", text: "buat asistennya yang bisa email", expect: true },
  // Should NOT match
  {
    label: "casual chat (no agent)",
    text: "gimana caranya buat presentasi yang bagus?",
    expect: false,
  },
  {
    label: "ask about schedule",
    text: "apa jadwal hari ini?",
    expect: false,
  },
  {
    label: "generate image (different tool)",
    text: "generate gambar kucing",
    expect: false,
  },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
  const actual = CREATE_PATTERN.test(c.text);
  const ok = actual === c.expect;
  console.log(
    `${ok ? "✓" : "✗"} ${c.label} → ${actual ? "match" : "no match"}${ok ? "" : ` (expected ${c.expect})`}`,
  );
  if (ok) passed++;
  else failed++;
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
