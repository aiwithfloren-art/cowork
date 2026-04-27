/**
 * Brave Search API wrapper. Used by Content Creator proactive cron for
 * trending/topical research. Free tier = 2K queries/month per key.
 *
 * Auth: BRAVE_SEARCH_API_KEY env var. If missing, callers should fall back
 * to prompt-only generation (no web grounding).
 *
 * Mock mode: set BRAVE_SEARCH_MOCK=1 to return canned results without
 * hitting the API. Used during local dev + E2E tests so we never
 * accidentally burn quota.
 */

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

export type BraveSearchResponse = {
  query: string;
  results: BraveSearchResult[];
  source: "brave" | "mock";
};

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

export async function braveSearch(args: {
  query: string;
  count?: number;
}): Promise<BraveSearchResponse> {
  const { query } = args;
  const count = Math.min(args.count ?? 5, 20);

  if (process.env.BRAVE_SEARCH_MOCK === "1") {
    return mockBraveSearch(query, count);
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BRAVE_SEARCH_API_KEY not configured. Set in Vercel env vars or use BRAVE_SEARCH_MOCK=1 for local dev.",
    );
  }

  const url = `${BRAVE_API_URL}?q=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brave Search ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> };
  };
  const results = (data.web?.results ?? []).slice(0, count).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    description: r.description ?? "",
  }));

  return { query, results, source: "brave" };
}

function mockBraveSearch(query: string, count: number): BraveSearchResponse {
  const stub: BraveSearchResult[] = [
    {
      title: `[MOCK] Trending insight about ${query}`,
      url: "https://example.com/mock-1",
      description: `Mock summary for "${query}". This is dummy data for local dev / E2E test. No real search performed.`,
    },
    {
      title: `[MOCK] Tips & tricks: ${query}`,
      url: "https://example.com/mock-2",
      description: `Second mock result. Replace with real Brave Search by unsetting BRAVE_SEARCH_MOCK.`,
    },
    {
      title: `[MOCK] Industry update related to ${query}`,
      url: "https://example.com/mock-3",
      description: `Third mock result with placeholder content.`,
    },
  ];
  return { query, results: stub.slice(0, count), source: "mock" };
}
