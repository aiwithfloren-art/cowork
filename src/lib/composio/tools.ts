import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";

/**
 * Loads Composio tools for a given Sigap user.
 *
 * Activation:
 *   - Requires COMPOSIO_API_KEY env var. If unset, returns {} silently.
 *   - Requires COMPOSIO_TOOLKITS env var (comma-separated list of toolkit
 *     slugs — e.g. "notion,linear,github"). If unset, returns {}.
 *
 * Per-user auth:
 *   - Composio identifies users by "entity". We use the Sigap userId as
 *     the entity, so each user's connected accounts stay isolated.
 *   - User must have gone through OAuth via /api/composio/connect for each
 *     toolkit before those tools will actually execute successfully.
 *   - Tools whose toolkit the user hasn't connected will still appear in
 *     the toolset but error at execution time — which is fine; the LLM
 *     sees the error and can tell the user to connect that app first.
 */
export async function getComposioTools(
  userId: string,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return {};

  const toolkitsRaw = process.env.COMPOSIO_TOOLKITS || "";
  const toolkits = toolkitsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (toolkits.length === 0) return {};

  try {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    const tools = (await composio.tools.get(userId, { toolkits })) as Record<
      string,
      unknown
    >;
    return tools;
  } catch (e) {
    console.error("composio: failed to load tools:", e);
    return {};
  }
}

/**
 * Generates an OAuth redirect URL for a user to connect a specific toolkit.
 * Requires COMPOSIO_AUTH_<TOOLKIT> env var pointing to the authConfigId
 * created in the Composio dashboard for that toolkit.
 */
export async function generateConnectUrl(
  userId: string,
  toolkit: string,
  callbackUrl: string,
): Promise<{ redirectUrl: string } | { error: string }> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return { error: "COMPOSIO_API_KEY not set" };

  const envKey = `COMPOSIO_AUTH_${toolkit.toUpperCase()}`;
  const authConfigId = process.env[envKey];
  if (!authConfigId) {
    return {
      error: `${envKey} not set. Create an auth config in Composio dashboard for '${toolkit}' and add its ID as that env var.`,
    };
  }

  try {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    const connRequest = await composio.connectedAccounts.initiate(
      userId,
      authConfigId,
      { callbackUrl },
    );
    if (!connRequest.redirectUrl) {
      return { error: "Composio returned no redirect URL" };
    }
    return { redirectUrl: connRequest.redirectUrl };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to initiate connection",
    };
  }
}

/**
 * Lists toolkits the user has already connected and authorized.
 */
export async function listConnectedToolkits(userId: string): Promise<string[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return [];
  try {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    const connections = await composio.connectedAccounts.list({
      userIds: [userId],
      statuses: ["ACTIVE"],
    });
    const items = (connections as { items?: Array<{ toolkit?: { slug?: string | null } }> }).items ?? [];
    const slugs: string[] = [];
    for (const c of items) {
      const s = c.toolkit?.slug;
      if (typeof s === "string" && s.length > 0) slugs.push(s);
    }
    return Array.from(new Set(slugs));
  } catch (e) {
    console.error("composio: failed to list connections:", e);
    return [];
  }
}
