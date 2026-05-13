/**
 * Jours fériés publics via Nager.Date (https://date.nager.at).
 * Gratuit, sans clé, ~100 pays. Endpoint principal :
 *   /api/v3/PublicHolidays/{year}/{countryCode}
 *
 * Le tool accepte le pays en clair ("France", "Japon") et le résout via
 * REST Countries (lib/countries.ts) pour récupérer le code cca2 nécessaire.
 * Default : France (FR), année en cours.
 */

import { fetchCountryInfo } from "./countries";

const UA = "JARVIS/1.0 (holidays client)";
const BASE_URL = "https://date.nager.at/api/v3";

export interface Holiday {
  date: string; // YYYY-MM-DD
  /** Nom local (ex: "Fête du Travail"). */
  localName: string;
  /** Nom anglais (ex: "Labour Day"). */
  name: string;
  /** Types Nager : Public, Bank, School, Authorities, Optional, Observance. */
  types: string[];
  /** Si la date dépend d'une règle religieuse / lunaire. */
  fixed: boolean;
}

export interface HolidaysReport {
  countryCode: string;
  countryName: string;
  year: number;
  count: number;
  holidays: Holiday[];
  /** Prochain jour férié à venir (si l'année demandée n'est pas dans le passé). */
  next: Holiday | null;
}

function resolveCountryCode(country: string): string | null {
  // Si déjà un code ISO 2 lettres, on l'utilise direct
  const trimmed = country.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export async function fetchHolidays(
  country: string,
  year?: number,
): Promise<HolidaysReport> {
  let cca2 = resolveCountryCode(country);
  let countryName = country;

  if (!cca2) {
    // Résolution via REST Countries
    const info = await fetchCountryInfo(country);
    if (!info) {
      throw new Error(
        `Pays '${country}' introuvable. Donne le nom complet (ex: 'France', 'Japan') ou le code ISO 2 lettres ('FR', 'JP').`,
      );
    }
    cca2 = info.cca2;
    countryName = info.nameFr ?? info.name;
  }

  const y = year ?? new Date().getFullYear();
  const url = `${BASE_URL}/PublicHolidays/${y}/${cca2}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Nager ${res.status} pour ${cca2}/${y}`);
  const data = await res.json();
  const holidays: Holiday[] = Array.isArray(data)
    ? data.map((h: Record<string, unknown>) => ({
        date: (h.date as string) ?? "",
        localName: (h.localName as string) ?? "",
        name: (h.name as string) ?? "",
        types: Array.isArray(h.types) ? (h.types as string[]) : [],
        fixed: !!h.fixed,
      }))
    : [];

  // Prochain à venir (date >= aujourd'hui)
  const today = new Date().toISOString().slice(0, 10);
  const next = holidays.find((h) => h.date >= today) ?? null;

  return {
    countryCode: cca2,
    countryName,
    year: y,
    count: holidays.length,
    holidays,
    next,
  };
}
