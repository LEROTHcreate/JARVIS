/**
 * Qualité de l'air via Open-Meteo Air Quality API.
 *
 * https://air-quality-api.open-meteo.com/v1/air-quality
 *   - Gratuit, sans clé, fair-use
 *   - Données CAMS (Copernicus Atmosphere Monitoring Service) : PM2.5, PM10,
 *     CO, NO2, SO2, O3 (ozone), pollen + indice européen EAQI (1-5)
 *
 * On retourne :
 *   - Mesures actuelles (current)
 *   - Indice EAQI européen avec libellé FR ("Très bon", "Bon", "Moyen"...)
 *   - Recommandation santé en fonction de l'indice
 */

const UA = "JARVIS/1.0 (air-quality client)";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

export interface AirQualityReport {
  lat: number;
  lng: number;
  /** Indice européen EAQI (1 = Très bon, 5 = Extrêmement mauvais). */
  europeanAqi: number;
  europeanAqiLabel: string;
  /** Recommandation santé liée à l'EAQI. */
  recommendation: string;
  /** US AQI (échelle 0-500) — utile pour comparer avec apps US. */
  usAqi: number;
  current: {
    pm2_5: number; // µg/m³
    pm10: number;
    carbon_monoxide: number;
    nitrogen_dioxide: number;
    sulphur_dioxide: number;
    ozone: number;
  };
  time: string; // ISO timestamp
}

const EAQI_LABEL: Record<number, { label: string; reco: string }> = {
  1: {
    label: "Très bon",
    reco: "Aucune restriction. Sortez sans inquiétude.",
  },
  2: {
    label: "Bon",
    reco: "Qualité satisfaisante. Activités extérieures normales.",
  },
  3: {
    label: "Moyen",
    reco: "Personnes sensibles : limiter les efforts intenses en extérieur.",
  },
  4: {
    label: "Mauvais",
    reco: "Réduire les activités intenses dehors. Asthmatiques : vigilance accrue.",
  },
  5: {
    label: "Très mauvais",
    reco: "Éviter les efforts en extérieur. Garder fenêtres fermées si possible.",
  },
};

function eaqiLabel(value: number): { label: string; reco: string } {
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  return EAQI_LABEL[rounded];
}

export async function fetchAirQuality(
  lat: number,
  lng: number,
): Promise<AirQualityReport> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current:
      "european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
    timezone: "auto",
  });
  const res = await fetch(`${AIR_URL}?${params.toString()}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`Open-Meteo Air ${res.status}`);
  const data = await res.json();
  const c = data?.current ?? {};
  const eaqi = c.european_aqi ?? 0;
  const { label, reco } = eaqiLabel(eaqi);
  return {
    lat,
    lng,
    europeanAqi: Math.round(eaqi),
    europeanAqiLabel: label,
    recommendation: reco,
    usAqi: Math.round(c.us_aqi ?? 0),
    current: {
      pm2_5: Math.round((c.pm2_5 ?? 0) * 10) / 10,
      pm10: Math.round((c.pm10 ?? 0) * 10) / 10,
      carbon_monoxide: Math.round((c.carbon_monoxide ?? 0) * 10) / 10,
      nitrogen_dioxide: Math.round((c.nitrogen_dioxide ?? 0) * 10) / 10,
      sulphur_dioxide: Math.round((c.sulphur_dioxide ?? 0) * 10) / 10,
      ozone: Math.round((c.ozone ?? 0) * 10) / 10,
    },
    time: c.time ?? new Date().toISOString(),
  };
}
