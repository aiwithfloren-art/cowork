/* eslint-disable */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import {
  isPublicEmailDomain,
  deriveCompanyNameFromEmail,
  routeAfterSignIn,
} from "../src/lib/signup-router";
import { createClient } from "@supabase/supabase-js";

async function main() {
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

  // Public domain detection
  assertEq(
    "gmail.com is public",
    isPublicEmailDomain("x@gmail.com"),
    true,
  );
  assertEq(
    "yahoo.com is public",
    isPublicEmailDomain("x@yahoo.com"),
    true,
  );
  assertEq(
    "acme.co.id is NOT public",
    isPublicEmailDomain("x@acme.co.id"),
    false,
  );
  assertEq(
    "proton.me is public",
    isPublicEmailDomain("x@proton.me"),
    true,
  );
  assertEq(
    "empty email treated as public (safe default)",
    isPublicEmailDomain(""),
    true,
  );

  // Company name derivation
  assertEq(
    "derive 'Acme' from @acme.co.id",
    deriveCompanyNameFromEmail("x@acme.co.id"),
    "Acme",
  );
  assertEq(
    "gmail returns null (can't derive)",
    deriveCompanyNameFromEmail("x@gmail.com"),
    null,
  );
  assertEq(
    "@stripe.com → Stripe",
    deriveCompanyNameFromEmail("x@stripe.com"),
    "Stripe",
  );

  // routeAfterSignIn — use real DB with test user
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: user } = await sb
    .from("users")
    .select("id, email")
    .eq("email", "aiwithfloren@gmail.com")
    .maybeSingle();

  if (user) {
    // Existing member → should return "app"
    const decision = await routeAfterSignIn(
      user.id as string,
      user.email as string,
      null,
    );
    assertEq(
      "existing member routes to app",
      decision.kind,
      "app",
    );
  } else {
    console.log("(skip routeAfterSignIn tests — test user missing)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
