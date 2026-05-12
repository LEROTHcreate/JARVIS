import { NextRequest } from "next/server";
import { z } from "zod";
import { synthesizeCartesia } from "@/lib/cartesia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  text: z.string().min(1).max(5000),
  language: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  try {
    const audio = await synthesizeCartesia(parsed.text, {
      language: parsed.language,
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur TTS inconnue";
    return new Response(message, { status: 500 });
  }
}
