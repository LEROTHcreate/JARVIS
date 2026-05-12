import { NextRequest } from "next/server";
import { searchNearby } from "@/lib/nearby";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  const radius = Math.min(
    parseInt(req.nextUrl.searchParams.get("radius") ?? "1500", 10) || 1500,
    10000,
  );

  if (!q || Number.isNaN(lat) || Number.isNaN(lng)) {
    return Response.json(
      { error: "Paramètres manquants : q, lat, lng requis." },
      { status: 400 },
    );
  }

  try {
    const results = await searchNearby(q, lat, lng, radius);
    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json(
      { error: `Overpass : ${message}`, results: [] },
      { status: 502 },
    );
  }
}
