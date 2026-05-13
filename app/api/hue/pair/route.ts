import { z } from "zod";
import { pairBridge } from "@/lib/hue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  ip: z.string().min(7),
  label: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Body invalide" }, { status: 400 });
  }

  try {
    const { username } = await pairBridge(parsed.ip, parsed.label);
    return Response.json({ username });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur pairing";
    // 403 si "link button not pressed" pour que le client puisse retry
    const isLink = message.toLowerCase().includes("link button");
    return Response.json(
      { error: message, linkButtonPending: isLink },
      { status: isLink ? 403 : 500 },
    );
  }
}
