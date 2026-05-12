export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilyResponse = {
  query: string;
  answer?: string;
  results: TavilyResult[];
};

function getKey() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error(
      "TAVILY_API_KEY manquante. Ajoute-la dans .env.local (https://app.tavily.com/).",
    );
  }
  return key;
}

export async function searchTavily(
  query: string,
  opts: { maxResults?: number; depth?: "basic" | "advanced" } = {},
): Promise<TavilyResponse> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: getKey(),
      query,
      search_depth: opts.depth ?? "basic",
      include_answer: true,
      max_results: opts.maxResults ?? 5,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Tavily API ${res.status}: ${errText || "réponse vide"}`);
  }
  const data = (await res.json()) as TavilyResponse;
  return {
    query: data.query ?? query,
    answer: data.answer,
    results: (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    })),
  };
}
