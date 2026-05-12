import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Geocodage léger via Nominatim (OpenStreetMap), gratuit.
 * Utile si Claude ne renvoie pas de coordonnées et qu'on doit en chercher.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return Response.json({ results: [] });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "JARVIS-SaaS/0.1 (dev)" },
      // Cache 1h
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json({ results: [] });
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    return Response.json({
      results: data.map((r) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      })),
    });
  } catch {
    return Response.json({ results: [] });
  }
}
