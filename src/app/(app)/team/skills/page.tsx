import { redirect } from "next/navigation";

// Skill Hub merged into /agents (admins see "Team agents" section there).
export default function TeamSkillsRedirect() {
  redirect("/agents");
}
