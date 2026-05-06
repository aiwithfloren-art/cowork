import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { routeAfterSignIn, deriveCompanyNameFromEmail } from "@/lib/signup-router";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingJoin } from "@/components/onboarding-join";

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const email = session?.user?.email;
  if (!userId || !email) redirect("/");

  const sb = supabaseAdmin();

  // If already onboarded + already in an org → straight to dashboard.
  const { data: settings } = await sb
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings?.onboarded_at) {
    const { data: membership } = await sb
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (membership?.org_id) redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const forceNew = params.force === "new";

  // Signup router — where does this user go?
  const decision = await routeAfterSignIn(userId, email, null);

  if (decision.kind === "app") {
    redirect("/dashboard");
  }

  // Domain match → join prompt (unless forced new)
  if (decision.kind === "join_prompt" && !forceNew) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <OnboardingJoin
          orgId={decision.orgId}
          orgName={decision.orgName}
          userEmail={email}
        />
      </div>
    );
  }

  // Path A: new-team wizard
  // Seed a minimal scratch "staging" org-less set of templates won't fit
  // — instead, the wizard's finalize step creates the org + seeds templates.
  // For the picker UI, we use the canonical starter-kit shape so the user
  // sees the same cards pre-create.
  const suggestedName = deriveCompanyNameFromEmail(email) ?? "";

  // Render the canonical starter-kit list for the picker (hardcoded shape —
  // source of truth is /src/lib/starter-kit.ts; we'll persist real rows on
  // finalize).
  // id = template name (finalize endpoint resolves by name, since templates
  // don't yet exist — seeded during finalize itself).
  const starterOptions = [
    {
      id: "Campaign Generator",
      name: "Campaign Generator",
      emoji: "🚀",
      description:
        "Killer demo: 1 brief manager → 5 deliverable (brief, carousel, LinkedIn, email, Twitter thread) auto-generated.",
      tools_preview: "carousel · gdoc · artifacts · web_search",
    },
    {
      id: "Content Creator",
      name: "Content Creator",
      emoji: "🎨",
      description:
        "Bikin carousel + caption + hashtag yang match brand tone — set sekali, request bebas.",
      tools_preview: "carousel · web_search · notes",
    },
    {
      id: "Lead Gen",
      name: "Lead Gen",
      emoji: "🎯",
      description:
        "Cari prospect by industry / city, fill ke Google Sheet, siap follow-up.",
      tools_preview: "web_search · gsheet · gmail",
    },
    {
      id: "Coder",
      name: "Coder",
      emoji: "💻",
      description:
        "Bikin landing page / web app, deploy ke Vercel, push ke GitHub.",
      tools_preview: "github · deploy · gdoc",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <OnboardingWizard
        suggestedOrgName={suggestedName}
        userEmail={email}
        starterOptions={starterOptions}
      />
    </div>
  );
}
