/**
 * Agrégateur d'actualités via RSS combinés français.
 *
 * Pourquoi RSS et pas une API news : gratuit, illimité, sans clé API, sans
 * signup, supporté par toutes les rédactions FR sérieuses. Tradeoff : on
 * parse du XML à la main (parser minimal regex) au lieu d'utiliser un
 * package node-rss-parser, mais ça évite une dépendance et c'est ~80 lignes.
 *
 * Sources actuelles : Le Monde (une), France Info (titres), Les Échos
 * (général), 20 Minutes (une). 4 rédactions = bonne couverture politique /
 * éco / société / tech. On peut en ajouter sans toucher au reste.
 */

const UA = "JARVIS/1.0 (rss reader)";

interface NewsSource {
  name: string;
  url: string;
}

const FEEDS: NewsSource[] = [
  { name: "Le Monde", url: "https://www.lemonde.fr/rss/une.xml" },
  { name: "France Info", url: "https://www.francetvinfo.fr/titres.rss" },
  {
    name: "Les Échos",
    url: "https://services.lesechos.fr/rss/les-echos-rss.xml",
  },
  { name: "20 Minutes", url: "https://www.20minutes.fr/rss/une.xml" },
];

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  source: string;
  pubDate: string | null;
}

/* --------- Parsing XML minimal --------- */

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : "";
}

function stripCdata(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/* --------- Fetch / parse d'un flux --------- */

async function fetchFeed(
  source: NewsSource,
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": UA },
    signal,
    // Cache 10 min côté serveur Next — les flux RSS ne changent pas plus vite
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items: NewsArticle[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const body = m[1];
    const title = stripHtml(stripCdata(extractTag(body, "title")));
    const link = stripCdata(extractTag(body, "link"));
    const description = stripHtml(stripCdata(extractTag(body, "description")));
    const pubDate = stripCdata(extractTag(body, "pubDate"));
    if (!title || !link) continue;
    items.push({
      title,
      link: link.trim(),
      description: description.slice(0, 280),
      source: source.name,
      pubDate: pubDate || null,
    });
  }
  return items;
}

/* --------- API publique --------- */

/**
 * Top articles du jour, optionnellement filtrés par mot-clé.
 *
 * Stratégie :
 *  - Fan-out parallèle sur toutes les sources, timeout doux par feed (4s)
 *  - Si filtre `topic` : ne garde que les articles dont titre OU description
 *    contient le mot-clé (case-insensitive). Si le filtre ne renvoie rien,
 *    on fallback sur les top news non filtrées (signaler dans le wrap).
 *  - Tri par pubDate desc, slice à `limit`
 */
export async function fetchNewsHeadlines(
  topic: string | null,
  limit = 12,
): Promise<{ articles: NewsArticle[]; filteredByTopic: boolean }> {
  const safeLimit = Math.max(1, Math.min(25, limit));
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 5000);

  const allFeeds = await Promise.all(
    FEEDS.map((f) =>
      fetchFeed(f, ctrl.signal).catch(() => [] as NewsArticle[]),
    ),
  );
  clearTimeout(timeoutId);
  const flat = allFeeds.flat();

  let filteredByTopic = false;
  let articles = flat;
  if (topic) {
    const tLower = topic.toLowerCase();
    const matched = flat.filter(
      (a) =>
        a.title.toLowerCase().includes(tLower) ||
        a.description.toLowerCase().includes(tLower),
    );
    if (matched.length > 0) {
      articles = matched;
      filteredByTopic = true;
    }
    // sinon on garde tout (fallback) — le LLM dira que le sujet exact n'apparaît pas dans les titres du jour
  }

  // Tri par date desc (null en dernier)
  articles.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  return { articles: articles.slice(0, safeLimit), filteredByTopic };
}
