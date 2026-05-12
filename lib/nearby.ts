export type NearbyPin = {
  name: string;
  lat: number;
  lng: number;
  description?: string;
  distance_m?: number;
};

const KEYWORD_FILTERS: Record<string, string[]> = {
  boulangerie: ["shop=bakery"],
  patisserie: ["shop=pastry", "shop=bakery"],
  pâtisserie: ["shop=pastry", "shop=bakery"],
  bakery: ["shop=bakery"],
  restaurant: ["amenity=restaurant"],
  resto: ["amenity=restaurant"],
  cafe: ["amenity=cafe"],
  café: ["amenity=cafe"],
  bar: ["amenity=bar"],
  pub: ["amenity=pub"],
  pharmacie: ["amenity=pharmacy"],
  pharmacy: ["amenity=pharmacy"],
  supermarche: ["shop=supermarket"],
  supermarché: ["shop=supermarket"],
  supermarket: ["shop=supermarket"],
  epicerie: ["shop=convenience", "shop=grocery"],
  épicerie: ["shop=convenience", "shop=grocery"],
  hopital: ["amenity=hospital"],
  hôpital: ["amenity=hospital"],
  hospital: ["amenity=hospital"],
  banque: ["amenity=bank"],
  bank: ["amenity=bank"],
  atm: ["amenity=atm"],
  dab: ["amenity=atm"],
  parking: ["amenity=parking"],
  essence: ["amenity=fuel"],
  fuel: ["amenity=fuel"],
  hotel: ["tourism=hotel"],
  hôtel: ["tourism=hotel"],
  ecole: ["amenity=school"],
  école: ["amenity=school"],
  cinema: ["amenity=cinema"],
  cinéma: ["amenity=cinema"],
  musee: ["tourism=museum"],
  musée: ["tourism=museum"],
  museum: ["tourism=museum"],
  parc: ["leisure=park"],
  park: ["leisure=park"],
  poste: ["amenity=post_office"],
  metro: ["railway=station", "station=subway"],
  métro: ["railway=station", "station=subway"],
  gare: ["railway=station"],
  station: ["railway=station"],
  tabac: ["shop=tobacco"],
  fleuriste: ["shop=florist"],
  coiffeur: ["shop=hairdresser"],
};

function buildOverpassQuery(
  query: string,
  lat: number,
  lng: number,
  radius: number,
): string {
  const q = query.toLowerCase().trim();
  const filters = KEYWORD_FILTERS[q];

  if (filters) {
    const parts = filters
      .map(
        (f) =>
          `nwr[${f.replace("=", '="')}"](around:${radius},${lat},${lng});`,
      )
      .join("");
    return `[out:json][timeout:20];(${parts});out center 30;`;
  }

  const escaped = q.replace(/"/g, '\\"');
  return `[out:json][timeout:20];nwr[name~"${escaped}",i](around:${radius},${lat},${lng});out center 30;`;
}

function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function searchNearby(
  query: string,
  lat: number,
  lng: number,
  radius = 1500,
  limit = 10,
): Promise<NearbyPin[]> {
  const overpassQuery = buildOverpassQuery(query, lat, lng, radius);

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(overpassQuery),
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Overpass ${res.status}`);
  }

  const data = (await res.json()) as {
    elements?: Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  return (data.elements ?? [])
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (typeof elLat !== "number" || typeof elLng !== "number") return null;
      const name =
        el.tags?.name ??
        el.tags?.brand ??
        el.tags?.["addr:street"] ??
        query;
      const street = el.tags?.["addr:street"];
      const housenum = el.tags?.["addr:housenumber"];
      const city = el.tags?.["addr:city"];
      const address = [
        [housenum, street].filter(Boolean).join(" "),
        city,
      ]
        .filter(Boolean)
        .join(", ");
      return {
        name,
        lat: elLat,
        lng: elLng,
        description: address || undefined,
        distance_m: Math.round(haversine(lat, lng, elLat, elLng)),
      } as NearbyPin;
    })
    .filter((p): p is NearbyPin => p !== null)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
    .slice(0, limit);
}
