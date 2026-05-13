/**
 * NASA APOD (Astronomy Picture of the Day) via api.nasa.gov.
 *
 *  - Clé DEMO_KEY : 30 req/h, suffisant pour usage perso
 *  - Si `NASA_API_KEY` est défini en env → 1000 req/h
 *  - Endpoint stable, gratuit, sans signup obligatoire
 */

const UA = "JARVIS/1.0 (nasa client)";
const BASE_URL = "https://api.nasa.gov/planetary/apod";

export interface NasaApod {
  date: string; // YYYY-MM-DD
  title: string;
  explanation: string;
  /** URL de l'image (PNG/JPG) — ou null si media_type=video. */
  imageUrl: string | null;
  /** URL HD si dispo. */
  hdImageUrl: string | null;
  /** "image" | "video". */
  mediaType: string;
  /** URL embed YouTube quand mediaType=video. */
  videoUrl: string | null;
  copyright: string | null;
}

/**
 * Récupère l'APOD du jour ou d'une date passée (YYYY-MM-DD, depuis 1995-06-16).
 */
export async function fetchNasaApod(date?: string): Promise<NasaApod> {
  const key = process.env.NASA_API_KEY?.trim() || "DEMO_KEY";
  const params = new URLSearchParams({
    api_key: key,
    thumbs: "true",
  });
  if (date) params.set("date", date);
  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new Error(
      `NASA APOD ${res.status}` +
        (key === "DEMO_KEY"
          ? " — utilise DEMO_KEY (30 req/h). Définir NASA_API_KEY dans .env pour 1000 req/h."
          : ""),
    );
  }
  const data = await res.json();
  const isVideo = data.media_type === "video";
  return {
    date: data.date ?? "",
    title: data.title ?? "",
    explanation: data.explanation ?? "",
    imageUrl: isVideo ? data.thumbnail_url ?? null : data.url ?? null,
    hdImageUrl: data.hdurl ?? null,
    mediaType: data.media_type ?? "image",
    videoUrl: isVideo ? data.url ?? null : null,
    copyright: data.copyright ?? null,
  };
}
