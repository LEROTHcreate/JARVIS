/**
 * Types pour les réponses MapTiler / MapLibre.
 *
 * MapTiler expose une API Geocoding compatible avec le format GeoJSON utilisé
 * par Mapbox — on reste donc proche d'un schéma standard "FeatureCollection".
 */

export type LngLat = [number, number];

export interface PlaceFeature {
  id: string;
  type: "Feature";
  /** ex: "POI", "place", "address", "street", "country" */
  place_type?: string[];
  /** Nom court, ex: "Boulangerie du Coin" */
  text: string;
  /** Nom complet, ex: "Boulangerie du Coin, 12 rue de la République, Marseille" */
  place_name: string;
  /** Coordonnées [lng, lat] */
  center: LngLat;
  geometry: {
    type: "Point";
    coordinates: LngLat;
  };
  /** Contexte hiérarchique : quartier, ville, région, pays (selon le niveau) */
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
  properties?: Record<string, unknown>;
}

export interface GeocodingResponse {
  type: "FeatureCollection";
  features: PlaceFeature[];
  query?: string[] | string;
}

/** Étape intermédiaire dans la séquence de zoom cinématique. */
export interface FlyStep {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing?: number;
  /** Durée d'animation en ms (override du défaut) */
  duration?: number;
}

/** Catégories POI reconnues par notre détection naïve. Mapping FR → label
 *  passé à l'API Search/Geocoding. */
export const POI_KEYWORDS: Record<string, string> = {
  boulangerie: "bakery",
  patisserie: "pastry",
  pâtisserie: "pastry",
  restaurant: "restaurant",
  resto: "restaurant",
  cafe: "cafe",
  café: "cafe",
  bar: "bar",
  pharmacie: "pharmacy",
  opticien: "opticians",
  audioprothesiste: "hearing aids",
  audioprothésiste: "hearing aids",
  supermarche: "supermarket",
  supermarché: "supermarket",
  hopital: "hospital",
  hôpital: "hospital",
  banque: "bank",
  parking: "parking",
  hotel: "hotel",
  hôtel: "hotel",
  musee: "museum",
  musée: "museum",
};

export function isPOICategory(query: string): string | null {
  const normalized = query.trim().toLowerCase();
  // Match exact d'abord
  if (POI_KEYWORDS[normalized]) return POI_KEYWORDS[normalized];
  // Sinon match sur le premier mot (ex: "boulangerie près d'ici")
  const firstWord = normalized.split(/\s+/)[0];
  return POI_KEYWORDS[firstWord] ?? null;
}
