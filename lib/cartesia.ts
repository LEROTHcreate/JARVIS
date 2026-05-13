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
 * Identifiants d'un compte Cartesia. Si non fournis, on retombe sur les
 * variables d'env du compte principal (CARTESIA_API_KEY / CARTESIA_VOICE_ID).
 */
export type CartesiaCredentials = {
  apiKey?: string;
  voiceId?: string;
};

/**
 * Synthétise du texte via Cartesia Sonic-3.5 multilingual.
 * Retourne le body audio (MP3 brut) sous forme de ReadableStream — on le pipe
 * directement au client pour minimiser la latence.
 *
 * `creds` permet d'utiliser un compte Cartesia secondaire (cascade quota).
 */
export async function synthesizeCartesia(
  text: string,
  opts: { language?: string; creds?: CartesiaCredentials } = {},
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = opts.creds?.apiKey ?? getKey();
  const voiceId = opts.creds?.voiceId ?? getVoiceId();

  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-3.5",
      transcript: text,
      voice: { mode: "id", id: voiceId },
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
