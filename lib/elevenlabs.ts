/**
 * Client ElevenLabs Text-to-Speech.
 *
 * Tier gratuit : 10k caractères/mois.
 * Utilisé comme fallback automatique quand Cartesia est en quota_exceeded.
 *
 * Récupère ta clé sur https://elevenlabs.io/app/settings/api-keys
 * Récupère un voice ID sur https://elevenlabs.io/app/voice-library
 * (cherche "French" puis copie l'ID, ou utilise les voix par défaut comme
 * "Charlotte" / "Antoni" qui parlent français correctement).
 */

function getKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY manquante. Ajoute-la dans .env.local (https://elevenlabs.io/app/settings/api-keys).",
    );
  }
  return key;
}

function getVoiceId() {
  // Voix par défaut : "Rachel" — multilingue, parle français
  return process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
}

function getModel() {
  // eleven_multilingual_v2 = la meilleure qualité pour le français
  return process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
}

/**
 * Synthétise du texte via l'API ElevenLabs.
 * Retourne le body audio (MP3 brut) sous forme de ReadableStream.
 * Si `voiceIdOverride` est fourni, l'utilise au lieu de ELEVENLABS_VOICE_ID
 * (utile pour basculer entre voix JARVIS et voix Ultron par ex).
 */
export async function synthesizeElevenLabs(
  text: string,
  voiceIdOverride?: string,
): Promise<ReadableStream<Uint8Array>> {
  const voiceId = voiceIdOverride || getVoiceId();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: getModel(),
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.1,
          use_speaker_boost: true,
        },
        output_format: "mp3_44100_128",
      }),
    },
  );

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs API ${res.status}: ${errText || "réponse vide"}`,
    );
  }

  return res.body;
}
