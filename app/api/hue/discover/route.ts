import { discoverBridges } from "@/lib/hue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bridges = await discoverBridges();
    return Response.json({ bridges });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur discovery";
    return Response.json({ error: message }, { status: 500 });
  }
}
