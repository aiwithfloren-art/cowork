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
  if (userId) {
    const sb = supabaseAdmin();
    const [{ count: ac }, { count: arc }] = await Promise.all([
      sb
        .from("custom_agents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      sb
        .from("artifacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("status", "archived"),
    ]);
    agentCount = ac ?? 0;
    artifactCount = arc ?? 0;
  }

  // 5 primary nav items — Notes/History/Audit accessible via Settings tabs
  // or direct URLs, but not cluttering the header.
  const navItems = [
    { href: "/dashboard", label: "Home" },
    { href: "/agents", label: "AI Employees", badge: agentCount },
    { href: "/artifacts", label: "Artifacts", badge: artifactCount },
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
