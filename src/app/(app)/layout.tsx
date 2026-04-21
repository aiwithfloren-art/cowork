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
  if (userId) {
    const sb = supabaseAdmin();
    const { count } = await sb
      .from("custom_agents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    agentCount = count ?? 0;
  }

  const navItems = [
    { href: "/dashboard", label: dict.nav.dashboard },
    { href: "/agents", label: "Agents", badge: agentCount },
    { href: "/team", label: dict.nav.team },
    { href: "/notes", label: dict.nav.notes },
    { href: "/history", label: dict.nav.history },
    { href: "/audit", label: dict.nav.audit },
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
