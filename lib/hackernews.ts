/**
 * Top stories Hacker News via l'API Firebase officielle.
 * Gratuit, sans clé, sans quota stricte, ultra-stable.
 *
 *   1. GET /v0/topstories.json → liste de ~500 IDs triés par score
 *   2. GET /v0/item/{id}.json par item (en parallèle pour les N premiers)
 *
 * À noter : certains items sont des "Ask HN" / "Show HN" sans url externe
 * (champ `url` absent). Dans ce cas on tombe sur l'URL HN canonique.
 */

const HN_BASE = "https://hacker-news.firebaseio.com/v0";
const UA = "JARVIS/1.0 (hackernews client)";

export interface HackerNewsItem {
  id: number;
  title: string;
  /** URL externe pointée par la story, ou null pour Ask/Show HN sans lien. */
  url: string | null;
  /** URL canonique du thread HN (toujours présente). */
  hnUrl: string;
  score: number;
  commentsCount: number;
  author: string;
  /** Âge relatif lisible : "3h", "27m", "1d", etc. */
  age: string;
}

/** Format un timestamp unix en âge relatif compact ("3h", "27m", "1d"). */
function formatRelativeAge(unixSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function formatItem(raw: {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  by?: string;
  time?: number;
}): HackerNewsItem {
  return {
    id: raw.id,
    title: raw.title ?? "",
    url: raw.url ?? null,
    hnUrl: `https://news.ycombinator.com/item?id=${raw.id}`,
    score: raw.score ?? 0,
    commentsCount: raw.descendants ?? 0,
    author: raw.by ?? "",
    age: raw.time ? formatRelativeAge(raw.time) : "?",
  };
}

/**
 * Top N stories actuelles (max 30, défaut 10). Cache 5 min côté serveur Next.
 */
export async function fetchHackerNewsTop(
  limit = 10,
): Promise<HackerNewsItem[]> {
  const safeLimit = Math.max(1, Math.min(30, limit));
  const idsRes = await fetch(`${HN_BASE}/topstories.json`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 300 },
  });
  if (!idsRes.ok) throw new Error(`HN topstories ${idsRes.status}`);
  const ids: number[] = await idsRes.json();
  const topIds = ids.slice(0, safeLimit);

  const items = await Promise.all(
    topIds.map(async (id) => {
      try {
        const r = await fetch(`${HN_BASE}/item/${id}.json`, {
          headers: { "User-Agent": UA },
          next: { revalidate: 300 },
        });
        if (!r.ok) return null;
        return formatItem(await r.json());
      } catch {
        return null;
      }
    }),
  );
  return items.filter((x): x is HackerNewsItem => x !== null);
}
