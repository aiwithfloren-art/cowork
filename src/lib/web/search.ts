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
  };
}
