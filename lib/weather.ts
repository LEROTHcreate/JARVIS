/**
 * Wrapper Open-Meteo — météo et prévisions pour n'importe quelle ville.
 *
 * 100% gratuit, sans clé API, sans limite stricte (fair-use). Deux APIs :
 *   1. Geocoding : convertit "Sommières" → {lat, lng, country, admin}
 *   2. Forecast : récupère les prévisions journalières (1-7 jours)
 *
 * Utilisé par le tool `get_weather` de JARVIS pour répondre à des questions
 * comme "quelle météo à Sommières samedi" ou "il va pleuvoir à Paris demain ?".
 *
 * Codes météo : standard OMM (WMO). Mapping FR dans WEATHER_LABEL_FR pour
 * que le LLM ait des libellés lisibles directement.
 */

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// User-Agent : pas obligatoire ici (Open-Meteo l'accepte sans) mais bonne
// pratique pour identifier le trafic en cas de souci.
const UA = "JARVIS/1.0 (open-meteo client)";

export interface GeocodedLocation {
  name: string;
  country: string | null;
  admin: string | null; // région / département
  lat: number;
  lng: number;
  timezone: string;
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  weekday: string; // "samedi"
  weatherCode: number;
  weatherLabel: string;
  tempMin: number;
  tempMax: number;
  precipitationMm: number;
  precipitationProbabilityPct: number | null;
  windMaxKmh: number;
}

export interface WeatherReport {
  location: GeocodedLocation;
  days: DailyForecast[];
}

/** Codes WMO → libellé court FR (réutilisé du composant TopRightInfo). */
const WEATHER_LABEL_FR: Record<number, string> = {
  0: "ciel clair",
  1: "globalement clair",
  2: "partiellement nuageux",
  3: "couvert",
  45: "brouillard",
  48: "brouillard givrant",
  51: "bruine légère",
  53: "bruine modérée",
  55: "bruine dense",
  56: "bruine verglaçante légère",
  57: "bruine verglaçante dense",
  61: "pluie faible",
  63: "pluie modérée",
  65: "pluie forte",
  66: "pluie verglaçante légère",
  67: "pluie verglaçante forte",
  71: "neige faible",
  73: "neige modérée",
  75: "neige forte",
  77: "grains de neige",
  80: "averses faibles",
  81: "averses modérées",
  82: "averses violentes",
  85: "averses de neige faibles",
  86: "averses de neige fortes",
  95: "orage",
  96: "orage avec grêle légère",
  99: "orage avec grêle forte",
};

function labelFor(code: number): string {
  return WEATHER_LABEL_FR[code] ?? `code ${code}`;
}

/**
 * Géocode une chaîne libre en coordonnées via Open-Meteo. On prend toujours
 * le premier résultat (le plus pertinent selon Open-Meteo) — suffisant pour
 * les villes connues, et le LLM peut toujours préciser le pays si ambigu.
 */
export async function geocodeLocation(
  query: string,
): Promise<GeocodedLocation | null> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Geocoding ${res.status}`);
  const data = await res.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return {
    name: first.name,
    country: first.country ?? null,
    admin: first.admin1 ?? first.admin2 ?? null,
    lat: first.latitude,
    lng: first.longitude,
    timezone: first.timezone ?? "auto",
  };
}

/**
 * Prévisions journalières (1-7 jours). Toutes les valeurs sont en unités
 * métriques (°C, mm, km/h). `forecast_days=1` retourne juste aujourd'hui.
 */
export async function fetchForecast(
  lat: number,
  lng: number,
  days: number,
  timezone = "auto",
): Promise<DailyForecast[]> {
  const safeDays = Math.max(1, Math.min(7, Math.round(days)));
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily:
      "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone,
    forecast_days: String(safeDays),
  });
  const url = `${FORECAST_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Forecast ${res.status}`);
  const data = await res.json();
  const d = data?.daily;
  if (!d || !Array.isArray(d.time)) return [];

  const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
  return d.time.map((iso: string, i: number) => {
    const date = new Date(iso);
    const code: number = d.weathercode?.[i] ?? 0;
    return {
      date: iso,
      weekday: weekdayFmt.format(date),
      weatherCode: code,
      weatherLabel: labelFor(code),
      tempMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      tempMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      precipitationMm: Number((d.precipitation_sum?.[i] ?? 0).toFixed(1)),
      precipitationProbabilityPct:
        typeof d.precipitation_probability_max?.[i] === "number"
          ? d.precipitation_probability_max[i]
          : null,
      windMaxKmh: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
    } satisfies DailyForecast;
  });
}

/**
 * Helper haut-niveau : géocode puis récupère les prévisions. Renvoie
 * `null` si la ville n'est pas trouvée — le LLM doit alors le signaler.
 */
export async function getWeather(
  location: string,
  days = 3,
): Promise<WeatherReport | null> {
  const loc = await geocodeLocation(location);
  if (!loc) return null;
  const forecast = await fetchForecast(loc.lat, loc.lng, days, loc.timezone);
  return { location: loc, days: forecast };
}
