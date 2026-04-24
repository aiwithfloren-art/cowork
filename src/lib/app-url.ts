/**
 * Canonical base URL of the app for links in emails, Telegram/Slack
 * replies, cron-triggered messages, and OAuth redirects. Replaces
 * scattered hardcoded cowork-gilt.vercel.app strings so whitelabel /
 * custom-domain deploys stay consistent.
 *
 * Order of precedence:
 *   1. NEXTAUTH_URL (set in every Vercel deployment + .env.local)
 *   2. Request Host header (for API routes that have a Request)
 *   3. Localhost fallback (offline / test contexts only)
 */
export function getAppUrl(req?: Request): string {
  const fromEnv = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (req) {
    const host = req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:3000";
}
