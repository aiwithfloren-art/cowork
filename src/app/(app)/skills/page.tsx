import { redirect } from "next/navigation";

// Backwards-compat redirect after the /skills → /agents rename. Keep
// indefinitely — old emails, Slack notifications, and team docs still
// link here.
export default function SkillsRedirect() {
  redirect("/agents");
}
