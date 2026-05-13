export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 600; // 10 minutes

/**
 * GET /api/news — proxy léger qui récupère les top headlines du jour
 * depuis le flux RSS Le Monde, parse les titres et les retourne en JSON.
 * Mis en cache 10min pour ne pas marteler la source.
 */
export async function GET() {
  try {
    const res = await fetch("https://www.lemonde.fr/rss/une.xml", {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    const xml = await res.text();

    // Parse minimaliste : on extrait <title> à l'intérieur de <item>
    const items: { title: string; source: string }[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && items.length < 15) {
      const block = m[1];
      const titleMatch = block.match(
        /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
      );
      if (!titleMatch) continue;
      const title = titleMatch[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      if (title) items.push({ title, source: "LE_MONDE" });
    }

    return Response.json({ headlines: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur RSS";
    return Response.json({ error: message, headlines: [] }, { status: 500 });
  }
}
