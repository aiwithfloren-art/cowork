import { auth, signIn } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = supabaseAdmin();

  const { data: invite } = await sb
    .from("org_invites")
    .select("id, org_id, email, role, manager_id, accepted, organizations(name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invite not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This invite link is invalid or has been revoked.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
        >
          Go home
        </Link>
      </main>
    );
  }

  if (invite.accepted) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invite already accepted</h1>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
        >
          Open dashboard
        </Link>
      </main>
    );
  }

  const session = await auth();
  const orgName = (invite as unknown as { organizations: { name: string } }).organizations?.name;

  async function accept() {
    "use server";
    const session = await auth();
    const uid = (session?.user as { id?: string } | undefined)?.id;
    const email = session?.user?.email?.toLowerCase();
    if (!uid || !email) return;

    const sb = supabaseAdmin();
    const { data: inv } = await sb
      .from("org_invites")
      .select("id, org_id, email, role, manager_id, accepted")
      .eq("token", token)
      .maybeSingle();

    if (!inv || inv.accepted) return;
    if (inv.email.toLowerCase() !== email) return; // email must match

    await sb.from("org_members").upsert({
      org_id: inv.org_id,
      user_id: uid,
      role: inv.role,
      manager_id: inv.manager_id,
      share_with_manager: false,
    });
    await sb.from("org_invites").update({ accepted: true }).eq("id", inv.id);
    revalidatePath("/team");
    redirect("/team");
  }

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-slate-900">
          Join {orgName} on Cowork
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Invited to <strong>{invite.email}</strong>. Sign in with Google to accept.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${token}` });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="inline-flex items-center gap-3 rounded-xl bg-slate-900 px-6 py-3 text-white shadow-lg hover:bg-slate-800"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#fff" d="M21.8 10.2h-9.8v3.9h5.6c-.2 1.5-1.6 4.4-5.6 4.4a6.5 6.5 0 1 1 0-13c2 0 3.4.9 4.1 1.6l2.8-2.7C17.1 2.8 14.8 1.9 12 1.9A10 10 0 1 0 22 12a9.6 9.6 0 0 0-.2-1.8z" />
            </svg>
            Sign in with Google
          </button>
        </form>
      </main>
    );
  }

  const emailMismatch = session.user.email?.toLowerCase() !== invite.email.toLowerCase();

  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-3xl font-bold text-slate-900">
        Join {orgName}?
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        You're signed in as <strong>{session.user.email}</strong>.
      </p>
      {emailMismatch ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This invite was sent to <strong>{invite.email}</strong> but you're signed in as{" "}
          <strong>{session.user.email}</strong>. Sign out and back in with the correct account.
        </div>
      ) : (
        <form action={accept} className="mt-8">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Accept invite
          </button>
        </form>
      )}
    </main>
  );
}
