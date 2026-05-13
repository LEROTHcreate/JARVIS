/**
 * Recherche de livres via Open Library (https://openlibrary.org).
 * Gratuit, sans clé, base ouverte massive (~30 M de livres).
 *
 * Endpoint : `/search.json?q=...`
 * On retourne titre, auteurs, année, ISBN, couverture (URL générée depuis
 * `cover_i` ou `isbn`), URL canonique OpenLibrary.
 */

const UA = "JARVIS/1.0 (openlibrary client)";
const SEARCH_URL = "https://openlibrary.org/search.json";

export interface BookResult {
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  publishers: string[];
  isbn: string | null;
  languages: string[];
  pageCount: number | null;
  coverUrl: string | null;
  openLibraryUrl: string;
  /** Liste des "subjects" — utile pour catégoriser thématiquement. */
  subjects: string[];
}

export async function searchBooks(
  query: string,
  limit = 5,
): Promise<BookResult[]> {
  const q = query.trim();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(15, limit));
  const params = new URLSearchParams({
    q,
    limit: String(safeLimit),
    // Demande seulement les champs utiles → réponse 10x plus petite
    fields:
      "key,title,author_name,first_publish_year,publisher,isbn,language,number_of_pages_median,cover_i,subject",
  });
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  const data = await res.json();
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return docs.map(normalize);
}

function normalize(raw: Record<string, unknown>): BookResult {
  const r = raw as {
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    publisher?: string[];
    isbn?: string[];
    language?: string[];
    number_of_pages_median?: number;
    cover_i?: number;
    subject?: string[];
  };
  const isbn = Array.isArray(r.isbn) && r.isbn.length > 0 ? r.isbn[0] : null;
  // Cover : préfère l'ID cover_i (fiable), fallback ISBN
  const coverUrl = r.cover_i
    ? `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg`
    : isbn
      ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
      : null;
  const olKey = r.key ?? "";
  return {
    title: r.title ?? "",
    authors: r.author_name ?? [],
    firstPublishYear: r.first_publish_year ?? null,
    publishers: (r.publisher ?? []).slice(0, 3),
    isbn,
    languages: r.language ?? [],
    pageCount: r.number_of_pages_median ?? null,
    coverUrl,
    openLibraryUrl: olKey ? `https://openlibrary.org${olKey}` : "",
    subjects: (r.subject ?? []).slice(0, 5),
  };
}
