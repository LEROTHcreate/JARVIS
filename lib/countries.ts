/**
 * Informations pays via REST Countries (https://restcountries.com).
 * Gratuit, sans clé, sans limite stricte, hébergé par la communauté.
 *
 * On normalise la sortie pour ne pas dumper tout l'objet REST Countries
 * (qui contient ~60 champs). On garde l'essentiel : nom, capitale, monnaie,
 * langues, population, drapeau, code ISO, region, sub-region, fuseau.
 */

const UA = "JARVIS/1.0 (countries client)";
const BASE_URL = "https://restcountries.com/v3.1";

export interface CountryInfo {
  name: string;
  /** Nom officiel (ex: "République française"). */
  officialName: string;
  /** Nom commun en français quand dispo. */
  nameFr: string | null;
  cca2: string; // code ISO 2 lettres
  cca3: string; // code ISO 3 lettres
  capital: string | null;
  region: string;
  subregion: string | null;
  population: number;
  area: number; // km²
  languages: string[]; // libellés
  currencies: Array<{ code: string; name: string; symbol: string | null }>;
  timezones: string[];
  flag: string; // emoji
  flagPng: string; // URL image
  latlng: [number, number] | null;
  borders: string[]; // codes des pays frontaliers
  /** URL OpenStreetMap pour ouvrir la carte. */
  mapUrl: string;
}

export async function fetchCountryInfo(
  query: string,
): Promise<CountryInfo | null> {
  const q = query.trim();
  if (!q) return null;
  // L'endpoint /name accepte des fragments — on prend le 1er résultat (le
  // plus pertinent selon REST Countries, généralement le match exact).
  const url = `${BASE_URL}/name/${encodeURIComponent(q)}?fullText=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 86400 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`REST Countries ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  // Tri : priorité au nom exact (case-insensitive), puis au commun le plus court
  data.sort((a, b) => {
    const aExact = a?.name?.common?.toLowerCase() === q.toLowerCase() ? 0 : 1;
    const bExact = b?.name?.common?.toLowerCase() === q.toLowerCase() ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (a?.name?.common ?? "").length - (b?.name?.common ?? "").length;
  });
  return normalize(data[0]);
}

function normalize(raw: Record<string, unknown>): CountryInfo {
  const r = raw as {
    name?: {
      common?: string;
      official?: string;
      nativeName?: Record<string, { common?: string }>;
    };
    translations?: Record<string, { common?: string }>;
    cca2?: string;
    cca3?: string;
    capital?: string[];
    region?: string;
    subregion?: string;
    population?: number;
    area?: number;
    languages?: Record<string, string>;
    currencies?: Record<string, { name?: string; symbol?: string }>;
    timezones?: string[];
    flag?: string;
    flags?: { png?: string; svg?: string };
    latlng?: [number, number];
    borders?: string[];
    maps?: { openStreetMaps?: string };
  };
  const currencies = r.currencies
    ? Object.entries(r.currencies).map(([code, v]) => ({
        code,
        name: v.name ?? code,
        symbol: v.symbol ?? null,
      }))
    : [];
  return {
    name: r.name?.common ?? "",
    officialName: r.name?.official ?? r.name?.common ?? "",
    nameFr: r.translations?.fra?.common ?? null,
    cca2: r.cca2 ?? "",
    cca3: r.cca3 ?? "",
    capital: r.capital?.[0] ?? null,
    region: r.region ?? "",
    subregion: r.subregion ?? null,
    population: r.population ?? 0,
    area: r.area ?? 0,
    languages: r.languages ? Object.values(r.languages) : [],
    currencies,
    timezones: r.timezones ?? [],
    flag: r.flag ?? "",
    flagPng: r.flags?.png ?? r.flags?.svg ?? "",
    latlng: r.latlng ?? null,
    borders: r.borders ?? [],
    mapUrl: r.maps?.openStreetMaps ?? "",
  };
}
