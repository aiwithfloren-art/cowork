import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Post-sign-in routing logic. Runs once after Google OAuth succeeds to
 * decide: does this user start a brand-new team (Path A), or join an
 * existing team (Path B)?
 *
 * Three layers, first match wins:
 *   1. Direct membership — user already in org_members. Go straight to app.
 *   2. Invite token — user came via /invite or /install link. Claim invite.
 *   3. Domain match — email domain has an existing org AND domain is not
 *      a public email provider (gmail, yahoo, etc.). Offer to join.
 *   4. Fallback — Path A, user creates a new team.
 */

export const PUBLIC_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.id",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "aol.com",
  "mail.com",
  "gmx.com",
  "gmx.de",
  "fastmail.com",
  "tutanota.com",
]);

export function isPublicEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return PUBLIC_EMAIL_DOMAINS.has(domain);
}

export function deriveCompanyNameFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;
  // Strip common TLDs + subdomain
  const stem = domain.split(".")[0];
  if (!stem) return null;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export type RouteDecision =
  | { kind: "app"; reason: "already_member"; orgId: string }
  | {
      kind: "join_prompt";
      reason: "domain_match";
      orgId: string;
      orgName: string;
    }
  | { kind: "claim_invite"; reason: "invite_token"; token: string }
  | { kind: "new_team"; reason: "no_match" };

/**
 * Decide the routing for a freshly-authenticated user.
 */
export async function routeAfterSignIn(
  userId: string,
  email: string,
  pendingInviteToken: string | null = null,
): Promise<RouteDecision> {
  const sb = supabaseAdmin();

  // Layer 1: direct membership
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membership?.org_id) {
    return {
      kind: "app",
      reason: "already_member",
      orgId: membership.org_id as string,
    };
  }

  // Layer 2: invite token present
  if (pendingInviteToken) {
    return {
      kind: "claim_invite",
      reason: "invite_token",
      token: pendingInviteToken,
    };
  }

  // Layer 3: domain match, skipping public providers
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
    // Find any org where at least one existing member has this domain
    const { data: domainMembers } = await sb
      .from("users")
      .select("id")
      .ilike("email", `%@${domain}`)
      .limit(50);
    const ids = (domainMembers ?? []).map((u) => u.id as string);
    if (ids.length > 0) {
      const { data: orgHit } = await sb
        .from("org_members")
        .select("org_id")
        .in("user_id", ids)
        .limit(1)
        .maybeSingle();
      if (orgHit?.org_id) {
        const { data: org } = await sb
          .from("organizations")
          .select("name")
          .eq("id", orgHit.org_id)
          .maybeSingle();
        return {
          kind: "join_prompt",
          reason: "domain_match",
          orgId: orgHit.org_id as string,
          orgName: (org?.name as string) ?? "this team",
        };
      }
    }
  }

  // Layer 4: new team
  return { kind: "new_team", reason: "no_match" };
}
