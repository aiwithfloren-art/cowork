import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { getDict, getLocale } from "@/lib/i18n";
import { AppNav } from "@/components/app-nav";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const dict = await getDict();
  const locale = await getLocale();
  const userId = (session.user as { id?: string }).id;

  let agentCount = 0;
  let artifactCount = 0;
  let pendingApprovals = 0;
  let showApprovals = false;
  if (userId) {
    const sb = supabaseAdmin();
    const [{ count: ac }, { count: arc }, membership] = await Promise.all([
      sb
        .from("custom_agents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      sb
        .from("artifacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "archived"),
      sb
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);
    agentCount = ac ?? 0;
    artifactCount = arc ?? 0;
    const role = (membership.data?.role as string | null) ?? null;
    const orgId = (membership.data?.org_id as string | null) ?? null;
    if (orgId && (role === "owner" || role === "manager")) {
      showApprovals = true;
      const { count: pc } = await sb
        .from("pending_approvals")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending");
      pendingApprovals = pc ?? 0;
    }
  }

  // 5-6 primary nav items — Approvals only visible to owner/manager.
  const navItems = [
    { href: "/dashboard", label: "Home" },
    { href: "/agents", label: "AI Employees", badge: agentCount },
    { href: "/artifacts", label: "Artifacts", badge: artifactCount },
    ...(showApprovals
      ? [{ href: "/approvals", label: "Approvals", badge: pendingApprovals }]
      : []),
    { href: "/team", label: dict.nav.team },
    { href: "/settings", label: dict.nav.settings },
  ];

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="min-h-screen">
      <AppNav
        items={navItems}
        locale={locale}
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
        signOutLabel={dict.nav.signOut}
        onSignOut={handleSignOut}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
