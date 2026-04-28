type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type TavilyResponse = {
  query: string;
  answer?: string;
  results: TavilyResult[];
};

export async function webSearch(args: {
  query: string;
  maxResults?: number;
  topic?: "general" | "news";
}): Promise<{
  query: string;
  answer: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  extracted: {
    instagram_handles: string[];
    emails: string[];
    phones: string[];
  };
}> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY not configured");
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: args.query,
      max_results: args.maxResults ?? 5,
      topic: args.topic ?? "general",
      include_answer: true,
      search_depth: "basic",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as TavilyResponse;
  // Pre-extract structured contact info from across all results so the
  // LLM can reference them directly. This bypasses an LLM extraction
  // step that gpt-4o-mini sometimes skips (e.g. ignoring the url field
  // when an Instagram URL is sitting right there).
  const allUrls = (data.results ?? []).map((r) => r.url ?? "").filter(Boolean);
  const allText = (data.results ?? [])
    .map((r) => `${r.title ?? ""} ${r.content ?? ""}`)
    .join("\n");

  const igMatches = [...allUrls, allText]
    .join(" ")
    .matchAll(
      /(?:https?:\/\/(?:www\.)?instagram\.com\/|@)([a-zA-Z0-9_.]{3,30})/g,
    );
  const igHandles = Array.from(
    new Set(
      Array.from(igMatches)
        .map((m: RegExpMatchArray) => `@${m[1].replace(/\.+$/, "")}`)
        .filter(
          (h: string) =>
            !["reel", "p", "explore", "stories"].some((skip) =>
              h.toLowerCase().slice(1).startsWith(skip),
            ),
        ),
    ),
  );

  const emails = Array.from(
    new Set(
      allText.match(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [],
    ),
  ).filter((e) => !e.includes("example.com") && !e.includes("@2x"));

  const phones = Array.from(
    new Set(
      [
        ...(allText.match(/\+62\s?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,5}/g) ?? []),
        ...(allText.match(/\b08\d{8,12}\b/g) ?? []),
        ...(allText.match(/\(021\)\s?\d{4,8}/g) ?? []),
      ],
    ),
  );

  return {
    query: data.query,
    answer: data.answer ?? "",
    sources: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      // Bumped 500→1500 chars so contact info (emails, IG handles, phone
      // numbers, addresses) that often live in body footers don't get
      // truncated. Tavily caps result body at ~5000 anyway, so 1500 is
      // a sane mid-point — enough context without bloating LLM tokens.
      snippet: r.content.slice(0, 1500),
    })),
    // Pre-extracted contact info aggregated across all results — agents
    // can reference these directly instead of re-extracting per source.
    extracted: {
      instagram_handles: igHandles.slice(0, 10),
      emails: emails.slice(0, 10),
      phones: phones.slice(0, 10),
    },
  };
}
