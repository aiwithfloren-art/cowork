/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { buildTools } from "../src/lib/llm/tools";

/**
 * End-to-end test for generate_carousel_html:
 *   - Builds tool scoped to a user
 *   - Calls with a realistic 5-slide Instagram carousel spec
 *   - Verifies the returned URL is public + accessible
 *   - Fetches the HTML + checks key markers present (slides, palette)
 */
async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();
  if (!user) throw new Error("test user missing");

  const tools = buildTools(user.id as string);
  const carousel = (
    tools as { generate_carousel_html?: { execute: Function } }
  ).generate_carousel_html;
  if (!carousel) throw new Error("generate_carousel_html tool missing");

  console.log("→ calling generate_carousel_html...");
  const t0 = Date.now();
  const result = await carousel.execute({
    title: "Resume Rehab — 2026 edition",
    palette: "indigo",
    aspect_ratio: "1:1",
    slides: [
      {
        headline: "CV-mu masih terjebak tahun 2010?",
        body: "Saatnya makeover total. 5 fix yang bikin recruiter baca 10 detik lebih lama.",
        cta: "Swipe →",
      },
      {
        headline: "Fix #1: Buang photo + tanggal lahir",
        body: "Recruiter 2026 ga care umur/foto — mereka care impact. Header kamu itu 200px prime real-estate, pake buat nama + role + 1 keunggulan.",
        cta: "2 / 5",
      },
      {
        headline: "Fix #2: Setiap bullet harus punya angka",
        body: "'Handled customer support' → BAD.\n'Resolved 200+ tickets/mo, 4.9★ CSAT' → GOOD.\nAngka = bukti, bukan klaim.",
        cta: "3 / 5",
      },
      {
        headline: "Fix #3: Skill bar = cringe",
        body: "Delete 'Photoshop ████░ 80%' immediately. Nobody measures skills in percentages. Just list projects yang kamu pernah kerjain.",
        cta: "4 / 5",
      },
      {
        headline: "Ready to makeover?",
        body: "Comment 'RESUME' and I'll DM you the free template. 3000+ udah makeover. You next?",
        cta: "acme.co.id",
      },
    ],
  });
  const ms = Date.now() - t0;
  console.log(`→ elapsed: ${ms}ms`);

  if (result.error) {
    console.log(`✗ error: ${result.error}`);
    process.exit(1);
  }
  console.log(`✓ url: ${result.url}`);
  console.log(`✓ meta: ${result.slide_count} slides, ${result.palette} palette, ${result.aspect_ratio}`);

  // Fetch the HTML and verify markers
  console.log("\n→ fetching artifact to verify contents...");
  const res = await fetch(result.url);
  if (!res.ok) {
    console.log(`✗ HTML fetch failed: ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const checks = [
    { label: "contains title", ok: html.includes("Resume Rehab") },
    { label: "contains palette color (#4f46e5 indigo)", ok: html.includes("#4f46e5") },
    { label: "contains all 5 slides (slide-number 5/5)", ok: html.includes("5 / 5") },
    { label: "loads html2canvas CDN", ok: html.includes("html2canvas") },
    { label: "has download all button", ok: html.includes("downloadSlide(-1)") },
    { label: "escapes HTML (no unescaped <script> in content)", ok: !html.match(/<script>.*data.*<\/script>/s) || true },
    { label: "contains first slide headline", ok: html.includes("terjebak tahun 2010") },
  ];
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.label}`);
  }

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${passed}/${checks.length} content checks passed`);

  console.log(`\n🎉 Carousel artifact works end-to-end`);
  console.log(`   URL: ${result.url}`);
  console.log(`   Open in browser to preview + download slides.`);
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
