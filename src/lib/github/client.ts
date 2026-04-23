import { Octokit } from "@octokit/rest";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Native GitHub integration — owns OAuth + REST calls directly instead of
 * going through Composio. Chosen because GitHub is the critical path for
 * the Coder/Reviewer agent workflow, so we want minimal latency, no extra
 * dependency, and tool surfaces tuned for exactly what we need.
 *
 * OAuth app registration (one-time, owner does this at github.com/
 * settings/developers):
 *   - Name: Sigap
 *   - Homepage URL: https://cowork-gilt.vercel.app
 *   - Callback URL: https://cowork-gilt.vercel.app/api/connectors/github/callback
 *   - Scopes requested on install: repo, user:email, read:org
 *
 * Env vars required:
 *   GITHUB_OAUTH_CLIENT_ID
 *   GITHUB_OAUTH_CLIENT_SECRET
 */

/**
 * Resolve an authenticated Octokit for a Sigap user, falling back to the
 * stored connector token. Throws if user hasn't connected GitHub yet —
 * tool callers should surface that error so the LLM tells the user to
 * connect first.
 */
export async function getOctokitForUser(userId: string): Promise<Octokit> {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("connectors")
    .select("access_token, external_account_label")
    .eq("user_id", userId)
    .eq("provider", "github")
    .is("org_id", null)
    .maybeSingle();
  if (!row?.access_token) {
    const host =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const installUrl = `${host}/api/connectors/github/install`;
    throw new Error(
      `GitHub not connected. Tell the user CLICKABLY in the reply: "Klik link ini buat authorize GitHub (sekali click): ${installUrl} — abis authorize lo bakal auto redirect balik, terus ketik 'done' atau ulang request-nya." Do NOT say "open settings" — paste the direct link.`,
    );
  }
  return new Octokit({ auth: row.access_token as string });
}

/**
 * Quick lookup of the GitHub username (login) associated with the current
 * Sigap user — used by tools that default to operating on the authenticated
 * user's repos when no explicit owner is given.
 */
export async function getGithubLogin(userId: string): Promise<string | null> {
  try {
    const octokit = await getOctokitForUser(userId);
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch {
    return null;
  }
}
