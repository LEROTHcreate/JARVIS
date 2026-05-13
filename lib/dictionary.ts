/**
 * Définitions de mots via deux sources gratuites sans clé :
 *
 *   - FR : Wiktionary FR (`fr.wiktionary.org/api/rest_v1/page/definition/{word}`)
 *     → renvoie un JSON structuré par classe grammaticale (fr/en).
 *   - EN : Free Dictionary API (`api.dictionaryapi.dev/api/v2/entries/en/{word}`)
 *     → format plus simple, plusieurs sens par entry.
 *
 * Le tool expose une interface unifiée : `definitions: Array<{ partOfSpeech, gloss, example? }>`.
 * Si on cherche en FR et qu'il n'y a pas d'entrée Wiktionary, on tente
 * automatiquement en EN (utile pour les anglicismes / termes techniques).
 */

const UA = "JARVIS/1.0 (dictionary client)";

export interface DictionaryEntry {
  word: string;
  lang: string;
  /** URL canonique vers la page source (Wiktionary ou DictionaryAPI). */
  url: string;
  definitions: Array<{
    partOfSpeech: string;
    gloss: string;
    example?: string;
  }>;
}

/* ---------- FR : Wiktionary ---------- */

async function fetchWiktionaryFr(word: string): Promise<DictionaryEntry | null> {
  const slug = encodeURIComponent(word.trim());
  const url = `https://fr.wiktionary.org/api/rest_v1/page/definition/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wiktionary FR ${res.status}`);
  const data = await res.json();
  // Format : { fr: [{ partOfSpeech, definitions: [{ definition, examples? }] }] }
  const sections = data?.fr;
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const definitions: DictionaryEntry["definitions"] = [];
  for (const section of sections) {
    const pos = section.partOfSpeech ?? "";
    for (const def of section.definitions ?? []) {
      const gloss = stripHtml(def.definition ?? "");
      if (!gloss) continue;
      const example = Array.isArray(def.examples) && def.examples[0]
        ? stripHtml(def.examples[0])
        : undefined;
      definitions.push({ partOfSpeech: pos, gloss, example });
      if (definitions.length >= 8) break;
    }
    if (definitions.length >= 8) break;
  }
  if (definitions.length === 0) return null;
  return {
    word,
    lang: "fr",
    url: `https://fr.wiktionary.org/wiki/${slug}`,
    definitions,
  };
}

/* ---------- EN : Free Dictionary API ---------- */

async function fetchFreeDictionaryEn(
  word: string,
): Promise<DictionaryEntry | null> {
  const slug = encodeURIComponent(word.trim().toLowerCase());
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 86400 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`FreeDictionary ${res.status}`);
  const data = await res.json();
  // Format : [{ word, meanings: [{ partOfSpeech, definitions: [{ definition, example? }] }] }]
  if (!Array.isArray(data) || data.length === 0) return null;
  const definitions: DictionaryEntry["definitions"] = [];
  for (const entry of data) {
    for (const meaning of entry.meanings ?? []) {
      const pos = meaning.partOfSpeech ?? "";
      for (const def of meaning.definitions ?? []) {
        if (!def.definition) continue;
        definitions.push({
          partOfSpeech: pos,
          gloss: def.definition,
          example: def.example,
        });
        if (definitions.length >= 8) break;
      }
      if (definitions.length >= 8) break;
    }
    if (definitions.length >= 8) break;
  }
  if (definitions.length === 0) return null;
  return {
    word,
    lang: "en",
    url: `https://en.wiktionary.org/wiki/${slug}`,
    definitions,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** API publique. Si FR demandé et rien trouvé → fallback EN automatique. */
export async function defineWord(
  word: string,
  lang = "fr",
): Promise<DictionaryEntry | null> {
  const safeLang = lang.toLowerCase();
  if (safeLang === "fr") {
    const fr = await fetchWiktionaryFr(word).catch(() => null);
    if (fr) return fr;
    return fetchFreeDictionaryEn(word).catch(() => null);
  }
  return fetchFreeDictionaryEn(word).catch(() => null);
}
