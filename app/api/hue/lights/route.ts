import { listLights, listGroups } from "@/lib/hue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hue/lights — retourne la liste des lampes + groupes connus.
 * Utilisé par la page de setup pour valider que la conf .env.local marche.
 */
export async function GET() {
  try {
    const [lights, groups] = await Promise.all([listLights(), listGroups()]);
    return Response.json({ lights, groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Hue";
    return Response.json({ error: message }, { status: 500 });
  }
}
