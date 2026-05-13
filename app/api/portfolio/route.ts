import { NextRequest } from "next/server";
import { fetchPortfolio } from "@/lib/portfolio";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio  — renvoie le snapshot complet du portfolio.
 * Query params optionnels :
 *  - ?refresh=1  → bypasse le cache (utile pour le bouton refresh)
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "portfolio", 60, 60_000);
  if (limited) return limited;

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    const snap = await fetchPortfolio(refresh);
    return new Response(JSON.stringify(snap), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[/api/portfolio]", msg);
    return new Response(
      JSON.stringify({ error: "portfolio_failed", message: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
