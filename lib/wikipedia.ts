/**
 * Résumé Wikipedia via l'API REST officielle.
 *
 * Endpoint : https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}
 *  - Gratuit, illimité, sans clé
 *  - Renvoie un extract propre (1 paragraphe, sans markup), URL canonique,
 *    et une miniature
 *  - Pour les titres ambigus / sans correspondance exacte, on tombe sur
 *    OpenSearch (`/w/api.php?action=opensearch`) pour résoudre le titre,
 *    puis on rappelle l'endpoint summary avec le titre canonique.
 */

const UA = "JARVIS/1.0 (wikipedia client; contact via app)";

export interface WikipediaSummary {
  title: string;
  /** Texte clean, 1 paragraphe condensé (~300-600 caractères). */
  extract: string;
  /** URL canonique vers la page Wikipedia. */
  url: string;
  /** Miniature illustrative si dispo. */
  thumbnail: string | null;
  /** Langue de l'article retourné ("fr", "en", etc.). */
  lang: string;
}

/**
 * Résout un titre potentiellement ambigu via OpenSearch et renvoie le
 * 1er match exact. Retourne null si aucune correspondance.
 */
async function resolveTitle(
  query: string,
  lang: string,
): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
    query,
  )}&limit=1&namespace=0&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = await res.json();
  // OpenSearch retourne [query, [titles], [descriptions], [urls]]
  return data?.[1]?.[0] ?? null;
}

export async function fetchWikipediaSummary(
  query: string,
  lang = "fr",
): Promise<WikipediaSummary | null> {
  const q = query.trim();
  if (!q) return null;
  const safeLang = lang.trim().toLowerCase() || "fr";

  const tryFetch = async (
    title: string,
    targetLang: string,
  ): Promise<WikipediaSummary | null> => {
    const slug = encodeURIComponent(title.replace(/\s+/g, "_"));
    const summaryUrl = `https://${targetLang}.wikipedia.org/api/rest_v1/page/summary/${slug}`;
    const res = await fetch(summaryUrl, {
      headers: { "User-Agent": UA },
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    const data = await res.json();
    // type "disambiguation" → on retourne quand même mais le LLM verra qu'il
    // faut demander précision (le champ description le mentionnera)
    if (!data.extract) return null;
    return {
      title: data.title ?? title,
      extract: data.extract,
      url:
        data.content_urls?.desktop?.page ??
        `https://${targetLang}.wikipedia.org/wiki/${slug}`,
      thumbnail: data.thumbnail?.source ?? null,
      lang: targetLang,
    };
  };

  // 1) tentative directe avec la query telle quelle
  try {
    const direct = await tryFetch(q, safeLang);
    if (direct) return direct;
  } catch {
    // erreur HTTP — on tente le fallback
  }

  // 2) résolution via opensearch
  const resolved = await resolveTitle(q, safeLang);
  if (resolved) {
    const r = await tryFetch(resolved, safeLang);
    if (r) return r;
  }

  // 3) Si on cherchait en FR et qu'il n'y a rien, fallback EN
  if (safeLang === "fr") {
    const resolvedEn = await resolveTitle(q, "en");
    if (resolvedEn) {
      const r = await tryFetch(resolvedEn, "en");
      if (r) return r;
    }
  }

  return null;
}
