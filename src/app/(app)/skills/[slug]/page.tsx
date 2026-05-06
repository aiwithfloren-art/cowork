import { redirect } from "next/navigation";

// Backwards-compat redirect: assignment notifications + emails point to
// /skills/[slug]. Real detail page lives at /agents/[slug].
export default async function SkillDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/agents/${slug}`);
}
