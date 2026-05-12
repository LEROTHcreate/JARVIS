function getKey() {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) {
    throw new Error(
      "CARTESIA_API_KEY manquante. Ajoute-la dans .env.local (https://play.cartesia.ai/).",
    );
  }
  return key;
}

function getVoiceId() {
  const id = process.env.CARTESIA_VOICE_ID;
  if (!id) {
    throw new Error(
      "CARTESIA_VOICE_ID manquante. Choisis une voix sur https://play.cartesia.ai/sounds et colle son ID dans .env.local.",
    );
  }
  return id;
}

/**
 * Synthétise du texte via Cartesia Sonic-3.5 multilingual.
 * Retourne le body audio (MP3 brut) sous forme de ReadableStream — on le pipe
 * directement au client pour minimiser la latence.
 */
export async function synthesizeCartesia(
  text: string,
  opts: { language?: string } = {},
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": getKey(),
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: getVoiceId() },
      language: opts.language ?? "fr",
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
      generation_config: {
        speed: 1,
        volume: 1,
      },
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Cartesia API ${res.status}: ${errText || "réponse vide"}`,
    );
  }

  return res.body;
}
