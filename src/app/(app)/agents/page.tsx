import { redirect } from "next/navigation";

// Backwards-compat redirect: old links (emails, Slack notifications,
// shared install tokens) still point to /agents. Keep redirect indefinitely.
export default function AgentsRedirect() {
  redirect("/skills");
}
