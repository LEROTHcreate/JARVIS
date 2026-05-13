/**
 * Recherche de papers scientifiques sur arXiv via l'API publique
 * (https://export.arxiv.org/api/query). Gratuit, sans clé, illimité.
 *
 * Format de réponse : Atom XML (un peu vieillot mais stable). On parse au
 * regex pour extraire les champs essentiels (title, summary, authors, pdf,
 * publishedDate, arxivId). Approche cohérente avec lib/news.ts (RSS).
 */

const UA = "JARVIS/1.0 (arxiv client)";
const ARXIV_URL = "https://export.arxiv.org/api/query";

export interface ArxivPaper {
  arxivId: string; // ex: "2401.04088"
  title: string;
  summary: string;
  authors: string[];
  /** Date de publication ISO (YYYY-MM-DD). */
  published: string;
  pdfUrl: string;
  abstractUrl: string;
  /** Catégories arXiv (ex: "cs.AI", "math.AG"). */
  categories: string[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function squashWhitespace(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : "";
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function extractAttr(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(
    `<${tag}[^>]*\\b${attr}="([^"]+)"[^>]*\\/?>`,
    "gi",
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/**
 * Recherche dans tous les champs (title + abstract + author), tri par
 * date de soumission descendante. limit clamp [1, 15].
 */
export async function searchArxiv(
  query: string,
  limit = 6,
): Promise<ArxivPaper[]> {
  const q = query.trim();
  if (!q) return [];
  const safeLimit = Math.max(1, Math.min(15, limit));
  // search_query=all:"..." pour tous les champs ; sortBy=submittedDate DESC
  const params = new URLSearchParams({
    search_query: `all:${q}`,
    start: "0",
    max_results: String(safeLimit),
    sortBy: "submittedDate",
    sortOrder: "descending",
  });
  const res = await fetch(`${ARXIV_URL}?${params.toString()}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const xml = await res.text();
  const entries = extractAllTags(xml, "entry");
  return entries.map(parseEntry).filter((p): p is ArxivPaper => p !== null);
}

function parseEntry(entryXml: string): ArxivPaper | null {
  const idUrl = squashWhitespace(extractTag(entryXml, "id"));
  // id ressemble à "http://arxiv.org/abs/2401.04088v1" → extraire 2401.04088
  const idMatch = idUrl.match(/abs\/([^v]+?)(?:v\d+)?$/);
  const arxivId = idMatch ? idMatch[1] : idUrl;
  const title = squashWhitespace(extractTag(entryXml, "title"));
  const summary = squashWhitespace(extractTag(entryXml, "summary"));
  if (!title || !summary) return null;
  const authorBlocks = extractAllTags(entryXml, "author");
  const authors = authorBlocks
    .map((b) => squashWhitespace(extractTag(b, "name")))
    .filter(Boolean);
  const published = squashWhitespace(extractTag(entryXml, "published")).slice(
    0,
    10,
  );
  const categories = extractAttr(entryXml, "category", "term");
  // PDF link : <link title="pdf" href="…" />
  const pdfMatch = entryXml.match(
    /<link[^>]*title="pdf"[^>]*href="([^"]+)"/i,
  );
  const pdfUrl = pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}`;
  return {
    arxivId,
    title,
    summary: summary.slice(0, 600),
    authors,
    published,
    pdfUrl,
    abstractUrl: `https://arxiv.org/abs/${arxivId}`,
    categories,
  };
}
