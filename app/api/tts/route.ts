import { NextRequest } from "next/server";
import { z } from "zod";
import { synthesizeCartesia } from "@/lib/cartesia";
import { synthesizeElevenLabs } from "@/lib/elevenlabs";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  text: z.string().min(1).max(5000),
  language: z.string().optional(),
  /** Flag mode Ultron : force ElevenLabs avec ULTRON_VOICE_ID. */
  ultron: z.boolean().optional(),
});

/**
 * Endpoint TTS avec cascade automatique :
 *   1. Cartesia #1 (compte principal, qualité top) → si erreur / quota →
 *   2. Cartesia #2 (compte secondaire, mêmes specs, quota séparé) — si
 *      `CARTESIA_API_KEY_2` n'est pas configurée, on saute directement →
 *   3. ElevenLabs (10k chars/mois gratuit) — si erreur → 500 retourné au
 *      client, qui bascule sur Web Speech API.
 *
 * Le client (ChatInterface) ne voit qu'un seul endpoint et reçoit du MP3
 * peu importe quel provider a finalement joué. Le header `X-TTS-Provider`
 * indique lequel a été utilisé (cartesia / cartesia-2 / elevenlabs).
 */
export async function POST(req: NextRequest) {
  // 60 requêtes / minute / IP — Cartesia est payant, plus strict que chat
  const limited = rateLimit(req, "tts", 60, 60_000);
  if (limited) return limited;

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  // Mode Ultron : on bypass Cartesia et on force ElevenLabs avec la voix
  // ULTRON_VOICE_ID. L'ID est gardé server-side (pas besoin de NEXT_PUBLIC).
  if (parsed.ultron) {
    const ultronVoice = process.env.ULTRON_VOICE_ID;
    if (!ultronVoice) {
      return new Response(
        "ULTRON_VOICE_ID manquante dans .env.local",
        { status: 500 },
      );
    }
    try {
      const audio = await synthesizeElevenLabs(parsed.text, ultronVoice);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-TTS-Provider": "elevenlabs-ultron",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur ElevenLabs";
      return new Response(`Ultron (ElevenLabs): ${msg}`, { status: 500 });
    }
  }

  // Tentative 1 : Cartesia compte principal
  try {
    const audio = await synthesizeCartesia(parsed.text, {
      language: parsed.language,
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Provider": "cartesia",
      },
    });
  } catch (cartesiaErr) {
    const cartesiaMsg =
      cartesiaErr instanceof Error
        ? cartesiaErr.message
        : "Erreur Cartesia inconnue";
    console.warn(
      "[/api/tts] Cartesia #1 échec → tentative compte #2 :",
      cartesiaMsg,
    );

    // Tentative 2 : Cartesia compte secondaire (si configuré)
    const secondaryKey = process.env.CARTESIA_API_KEY_2;
    if (secondaryKey) {
      try {
        const audio = await synthesizeCartesia(parsed.text, {
          language: parsed.language,
          creds: {
            apiKey: secondaryKey,
            voiceId:
              process.env.CARTESIA_VOICE_ID_2 ?? process.env.CARTESIA_VOICE_ID,
          },
        });
        return new Response(audio, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "X-TTS-Provider": "cartesia-2",
            "X-TTS-Cartesia-Error": cartesiaMsg.slice(0, 200),
          },
        });
      } catch (cartesia2Err) {
        const cartesia2Msg =
          cartesia2Err instanceof Error
            ? cartesia2Err.message
            : "Erreur Cartesia #2 inconnue";
        console.warn(
          "[/api/tts] Cartesia #2 échec → tentative ElevenLabs :",
          cartesia2Msg,
        );

        // Tentative 3 : ElevenLabs (après deux échecs Cartesia)
        try {
          const audio = await synthesizeElevenLabs(parsed.text);
          return new Response(audio, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-TTS-Provider": "elevenlabs",
              "X-TTS-Cartesia-Error": cartesiaMsg.slice(0, 200),
              "X-TTS-Cartesia2-Error": cartesia2Msg.slice(0, 200),
            },
          });
        } catch (elevenErr) {
          const elevenMsg =
            elevenErr instanceof Error
              ? elevenErr.message
              : "Erreur ElevenLabs inconnue";
          console.error("[/api/tts] ElevenLabs aussi échec :", elevenMsg);
          return new Response(
            `Cartesia #1: ${cartesiaMsg} | Cartesia #2: ${cartesia2Msg} | ElevenLabs: ${elevenMsg}`,
            { status: 500 },
          );
        }
      }
    }

    // Pas de Cartesia secondaire configurée : ElevenLabs directement
    try {
      const audio = await synthesizeElevenLabs(parsed.text);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-TTS-Provider": "elevenlabs",
          "X-TTS-Cartesia-Error": cartesiaMsg.slice(0, 200),
        },
      });
    } catch (elevenErr) {
      const elevenMsg =
        elevenErr instanceof Error
          ? elevenErr.message
          : "Erreur ElevenLabs inconnue";
      console.error("[/api/tts] ElevenLabs aussi échec :", elevenMsg);
      return new Response(
        `Cartesia: ${cartesiaMsg} | ElevenLabs: ${elevenMsg}`,
        { status: 500 },
      );
    }
  }
}
