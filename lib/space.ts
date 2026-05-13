/**
 * Données spatiales live :
 *
 *   1. SpaceX (api.spacexdata.com v5) — prochains lancements + dernier
 *      Gratuit, sans clé, archive ouverte (rocket, mission, payload).
 *
 *   2. ISS (api.wheretheiss.at) — position en temps réel + équipage actuel
 *      Gratuit, sans clé. Plus stable que open-notify.org.
 *
 * Pourquoi un seul fichier : les deux sources servent au tracking spatial
 * "JARVIS-style" (genre "satellites monitored").
 */

const UA = "JARVIS/1.0 (space client)";

/* ================================ SpaceX ================================ */

const SPACEX_BASE = "https://api.spacexdata.com/v5";
const SPACEX_LATEST_BASE = "https://api.spacexdata.com/v4";

export interface SpaceXLaunch {
  name: string;
  flightNumber: number;
  /** ISO date du lancement (planifié ou réel). */
  date: string;
  /** Tentative humaine ("dans 3 j", "il y a 2 mois", etc.). */
  relativeDate: string;
  rocket: string;
  launchpad: string;
  success: boolean | null; // null si à venir
  details: string | null;
  webcastUrl: string | null;
  patchUrl: string | null;
  upcoming: boolean;
}

function relativeTimeFr(isoDate: string): string {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((t - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return fmt.format(diffSec, "second");
  if (abs < 3600) return fmt.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return fmt.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2592000)
    return fmt.format(Math.round(diffSec / 86400), "day");
  if (abs < 31536000)
    return fmt.format(Math.round(diffSec / 2592000), "month");
  return fmt.format(Math.round(diffSec / 31536000), "year");
}

/** Cache local des noms (rockets, launchpads) pour ne pas re-fetcher 50 fois. */
const nameCache = new Map<string, string>();

async function resolveName(
  collection: "rockets" | "launchpads",
  id: string,
): Promise<string> {
  const cacheKey = `${collection}:${id}`;
  const cached = nameCache.get(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(`${SPACEX_LATEST_BASE}/${collection}/${id}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return id;
    const data = await res.json();
    const name = data?.name ?? data?.full_name ?? id;
    nameCache.set(cacheKey, name);
    return name;
  } catch {
    return id;
  }
}

async function enrichLaunch(raw: Record<string, unknown>): Promise<SpaceXLaunch> {
  const r = raw as {
    name?: string;
    flight_number?: number;
    date_utc?: string;
    rocket?: string;
    launchpad?: string;
    success?: boolean | null;
    details?: string | null;
    upcoming?: boolean;
    links?: {
      webcast?: string | null;
      patch?: { small?: string | null; large?: string | null };
    };
  };
  const date = r.date_utc ?? new Date().toISOString();
  const [rocket, launchpad] = await Promise.all([
    r.rocket ? resolveName("rockets", r.rocket) : Promise.resolve("?"),
    r.launchpad
      ? resolveName("launchpads", r.launchpad)
      : Promise.resolve("?"),
  ]);
  return {
    name: r.name ?? "Mission",
    flightNumber: r.flight_number ?? 0,
    date,
    relativeDate: relativeTimeFr(date),
    rocket,
    launchpad,
    success: r.success ?? null,
    details: r.details ?? null,
    webcastUrl: r.links?.webcast ?? null,
    patchUrl: r.links?.patch?.small ?? r.links?.patch?.large ?? null,
    upcoming: !!r.upcoming,
  };
}

/** Prochains lancements (limite N, défaut 3, max 10). */
export async function fetchSpaceXUpcoming(
  limit = 3,
): Promise<SpaceXLaunch[]> {
  const safeLimit = Math.max(1, Math.min(10, limit));
  const res = await fetch(`${SPACEX_BASE}/launches/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      query: { upcoming: true },
      options: {
        sort: { date_utc: "asc" },
        limit: safeLimit,
        pagination: false,
      },
    }),
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`SpaceX ${res.status}`);
  const data = await res.json();
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return Promise.all(docs.map(enrichLaunch));
}

/** Dernier lancement effectué. */
export async function fetchSpaceXLatest(): Promise<SpaceXLaunch> {
  const res = await fetch(`${SPACEX_BASE}/launches/latest`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`SpaceX latest ${res.status}`);
  const data = await res.json();
  return enrichLaunch(data);
}

/* ================================ ISS ================================== */

const ISS_POSITION_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const ISS_ASTROS_URL = "http://api.open-notify.org/astros.json";

export interface IssPosition {
  lat: number;
  lng: number;
  altitudeKm: number;
  velocityKmh: number;
  /** Au-dessus de quel "lieu" approximatif (océan / continent). */
  visibility: string; // "daylight" | "eclipsed"
  timestamp: string; // ISO
}

export interface IssReport {
  position: IssPosition;
  /** Équipage actuel à bord (ISS + autres vaisseaux en orbite). */
  crew: Array<{ name: string; craft: string }>;
  crewCount: number;
}

async function fetchIssPosition(): Promise<IssPosition> {
  const res = await fetch(ISS_POSITION_URL, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ISS position ${res.status}`);
  const data = await res.json();
  return {
    lat: Math.round((data.latitude ?? 0) * 10000) / 10000,
    lng: Math.round((data.longitude ?? 0) * 10000) / 10000,
    altitudeKm: Math.round((data.altitude ?? 0) * 10) / 10,
    velocityKmh: Math.round((data.velocity ?? 0) * 10) / 10,
    visibility: data.visibility ?? "unknown",
    timestamp: data.timestamp
      ? new Date(data.timestamp * 1000).toISOString()
      : new Date().toISOString(),
  };
}

async function fetchIssCrew(): Promise<IssReport["crew"]> {
  try {
    const res = await fetch(ISS_ASTROS_URL, {
      headers: { "User-Agent": UA },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const people = Array.isArray(data?.people) ? data.people : [];
    return people.map((p: { name?: string; craft?: string }) => ({
      name: p.name ?? "?",
      craft: p.craft ?? "?",
    }));
  } catch {
    return [];
  }
}

export async function fetchIssReport(): Promise<IssReport> {
  const [position, crew] = await Promise.all([
    fetchIssPosition(),
    fetchIssCrew(),
  ]);
  return { position, crew, crewCount: crew.length };
}
