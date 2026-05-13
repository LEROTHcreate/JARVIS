/**
 * Wrappers MapTiler Geocoding API — pas de CB requise.
 *
 * Endpoint forward : https://api.maptiler.com/geocoding/{query}.json
 * Doc : https://docs.maptiler.com/cloud/api/geocoding/
 *
 * Tier gratuit : 100 000 requêtes / mois. Largement suffisant.
 */

import type { GeocodingResponse, LngLat, PlaceFeature } from "@/types/map";

const BASE = "https://api.maptiler.com/geocoding";

function getKey(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_MAPTILER_KEY manquante. Ajoute-la dans .env.local (https://www.maptiler.com/).",
    );
  }
  return key;
}

interface SearchOptions {
  /** Biais de proximité [lng, lat] — les résultats proches remontent en haut. */
  proximity?: LngLat;
  /** Limite de résultats (défaut 5). */
  limit?: number;
  /** Langue (ISO 639-1). Défaut "fr". */
  language?: string;
  /** Filtre par types de lieu (POI, address, street, etc.). */
  types?: string[];
  /** Bounding box pour restreindre la recherche [minLng, minLat, maxLng, maxLat]. */
  bbox?: [number, number, number, number];
  /** AbortController signal pour annuler. */
  signal?: AbortSignal;
}

async function callGeocoding(
  query: string,
  opts: SearchOptions = {},
): Promise<GeocodingResponse> {
  const url = new URL(`${BASE}/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", getKey());
  url.searchParams.set("language", opts.language ?? "fr");
  url.searchParams.set("limit", String(opts.limit ?? 5));
  if (opts.proximity) {
    url.searchParams.set("proximity", `${opts.proximity[0]},${opts.proximity[1]}`);
  }
  if (opts.types?.length) {
    url.searchParams.set("types", opts.types.join(","));
  }
  if (opts.bbox) {
    url.searchParams.set("bbox", opts.bbox.join(","));
  }

  const res = await fetch(url.toString(), { signal: opts.signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MapTiler ${res.status}: ${errText || "réponse vide"}`);
  }
  return (await res.json()) as GeocodingResponse;
}

/**
 * Forward geocoding générique — pour les adresses, noms de lieux, monuments.
 * Ex: "40 rue Saint-Sébastien Marseille", "Tour Eiffel", "Marseille"
 */
export async function searchAddress(
  query: string,
  opts: SearchOptions = {},
): Promise<PlaceFeature | null> {
  const data = await callGeocoding(query, opts);
  return data.features[0] ?? null;
}

/**
 * Recherche POI par catégorie. MapTiler ne propose pas d'endpoint dédié
 * "Search Box" comme Mapbox, mais Geocoding gère bien les catégories
 * combinées avec un proximity bias fort.
 *
 * Ex: searchPOI("bakery", proximity) → boulangeries autour de la position.
 *
 * On combine `category` + `proximity` ; si l'API ne renvoie rien on
 * fallback sur une recherche libre.
 */
export async function searchPOI(
  category: string,
  proximity: LngLat,
  opts: Omit<SearchOptions, "proximity" | "types"> = {},
): Promise<PlaceFeature | null> {
  // MapTiler Geocoding accepte les catégories en query libre ; le proximity
  // bias suffit à remonter le plus proche en tête.
  let data = await callGeocoding(category, {
    ...opts,
    proximity,
    types: ["poi"],
    limit: opts.limit ?? 5,
  });

  // Fallback : si pas de POI, on tente sans filtre `types`
  if (!data.features.length) {
    data = await callGeocoding(category, {
      ...opts,
      proximity,
      limit: opts.limit ?? 5,
    });
  }
  return data.features[0] ?? null;
}

/**
 * Reverse geocoding — retourne le contexte hiérarchique d'un point.
 * Utile pour récupérer la ville à partir des coords retournées par
 * `searchAddress` (pour faire une étape "ville" dans le zoom).
 */
export async function reverseGeocode(
  lngLat: LngLat,
  opts: Omit<SearchOptions, "proximity"> = {},
): Promise<PlaceFeature | null> {
  const url = new URL(`${BASE}/${lngLat[0]},${lngLat[1]}.json`);
  url.searchParams.set("key", getKey());
  url.searchParams.set("language", opts.language ?? "fr");
  url.searchParams.set("limit", "1");
  if (opts.types?.length) {
    url.searchParams.set("types", opts.types.join(","));
  }
  const res = await fetch(url.toString(), { signal: opts.signal });
  if (!res.ok) return null;
  const data = (await res.json()) as GeocodingResponse;
  return data.features[0] ?? null;
}

/**
 * Tente d'extraire la ville depuis le `context` d'une feature.
 * Retourne `{ name, center }` ou null si pas trouvable.
 */
export function extractCityFromFeature(
  feature: PlaceFeature,
): { name: string; center: LngLat } | null {
  // Si la feature elle-même EST une place (ville), on la prend
  if (feature.place_type?.includes("place")) {
    return { name: feature.text, center: feature.center };
  }
  // Sinon on cherche dans le contexte
  const cityCtx = feature.context?.find((c) => c.id.startsWith("place"));
  if (!cityCtx) return null;
  // MapTiler met les coords de la ville dans `feature.center` du contexte
  // mais le format `context` ne contient pas les coords. On utilise donc
  // les coords de la feature elle-même décalées vers le centre approximatif.
  return { name: cityCtx.text, center: feature.center };
}
