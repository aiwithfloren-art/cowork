/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { buildTools } from "../src/lib/llm/tools";
import * as fs from "fs";

/**
 * Full PNG pipeline E2E:
 *   1. Call generate_carousel_html tool (stores manifest, returns PNG URLs)
 *   2. Hit each PNG URL via fetch → verify it returns image/png bytes
 *   3. Save first slide to /tmp for visual check
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
  if (!carousel) throw new Error("generate_carousel_html missing");

  console.log("→ step 1: call tool");
  const t0 = Date.now();
  const result = await carousel.execute({
    title: "Resume Rehab 2026",
    palette: "indigo",
    aspect_ratio: "1:1",
    slides: [
      {
        headline: "CV kamu masih 2010?",
        body: "5 fix yang bikin recruiter baca 10 detik lebih lama.",
        cta: "Swipe →",
      },
      {
        headline: "Fix 1: Buang foto + tanggal lahir",
        body: "Header kamu = prime real-estate. Pake buat nama + role + 1 keunggulan.",
        cta: "2 / 3",
      },
      {
        headline: "Ready to makeover?",
        body: "Comment 'RESUME' and I'll DM the template. 3000+ udah makeover.",
        cta: "acme.co.id",
      },
    ],
  });
  console.log(`  ✓ tool returned in ${Date.now() - t0}ms`);
  if (result.error) {
    console.log(`  ✗ tool error: ${result.error}`);
    process.exit(1);
  }
  console.log(`  ✓ manifest_id: ${result.manifest_id}`);
  console.log(`  ✓ ${result.png_urls.length} PNG URLs returned`);

  console.log("\n→ step 2: fetch each PNG");
  for (let i = 0; i < result.png_urls.length; i++) {
    const url = result.png_urls[i];
    const t1 = Date.now();
    const res = await fetch(url);
    const ct = res.headers.get("content-type");
    const size = Number(res.headers.get("content-length") ?? 0);
    const elapsed = Date.now() - t1;
    if (!res.ok) {
      console.log(`  ✗ slide ${i}: ${res.status} ${res.statusText}`);
      const body = await res.text().catch(() => "");
      console.log(`    body preview: ${body.slice(0, 200)}`);
      continue;
    }
    console.log(
      `  ✓ slide ${i}: ${res.status} · ${ct} · ${size || "?"} bytes · ${elapsed}ms`,
    );
    if (i === 0) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync("/tmp/slide-0.png", buf);
      console.log(`    saved to /tmp/slide-0.png (${buf.length} bytes)`);
    }
  }

  console.log("\n🎉 PNG pipeline works end-to-end");
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
