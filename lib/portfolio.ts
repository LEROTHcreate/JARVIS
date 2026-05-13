import { google } from "googleapis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Une ligne de position du portfolio (mappage colonnes A→V de la feuille
 * "Portefeuille"). Tous les champs numériques sont des `number | null`
 * (null si la cellule est vide ou non parseable).
 */
export interface Position {
  ticker: string;
  name: string;
  sector: string;
  quantity: number | null;
  pru: number | null; // prix de revient unitaire
  price: number | null; // prix actuel
  varDayPct: number | null; // variation jour %
  currency: string;
  totalAchat: number | null; // montant investi
  totalActuel: number | null; // valeur actuelle
  gainEur: number | null; // P&L absolu €
  gainPct: number | null; // P&L %
  account: string; // broker (PEA Bourso, CTO IBKR, Binance+Ledger…)
  low52: number | null;
  high52: number | null;
  divYieldPct: number | null;
  divAnnual: number | null;
  weightPct: number | null; // taille dans le portif %
}

/**
 * Snapshot complet du portfolio renvoyé au LLM. `positions` peut être
 * filtré (par compte, secteur, etc.) avant envoi pour limiter les tokens.
 */
export interface PortfolioSnapshot {
  positions: Position[];
  totals: {
    totalAchat: number;
    totalActuel: number;
    gainEur: number;
    gainPct: number;
    count: number;
  };
  fetchedAt: string;
}

// --- Cache mémoire (1 min) — évite de hammerer Google Sheets API
let cache: { data: PortfolioSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Parse un nombre depuis une cellule Google Sheets. Gère :
 *  - format français : "1 234,56", "12,5%"
 *  - format US : "1,234.56", "12.5%"
 *  - chaînes vides / "-" → null
 */
function parseNum(raw: string | undefined | null): number | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/[€$£¥%\s]/g, "");
  if (!trimmed || trimmed === "-") return null;
  // Format FR : virgule décimale + espace ou point séparateur de milliers
  // Format US : point décimal + virgule séparateur de milliers
  // Heuristique : si le dernier séparateur est ",", c'est FR
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // FR : enlève les points (milliers) puis remplace virgule par point
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    // US ou pas de virgule : enlève les virgules (milliers)
    normalized = trimmed.replace(/,/g, "");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lit la feuille Portefeuille via Google Sheets API. Mémoïse le résultat
 * pendant `CACHE_TTL_MS` pour économiser quotas + latence.
 */
export async function fetchPortfolio(
  forceRefresh = false,
): Promise<PortfolioSnapshot> {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  // Auth : 2 modes supportés (dans l'ordre de priorité)
  //  1. GOOGLE_SA_KEY_FILE → chemin relatif vers le fichier JSON SA téléchargé
  //     depuis Google Cloud Console (zéro problème d'échappement)
  //  2. GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY → fallback legacy si tu
  //     préfères tout dans .env.local
  let email: string | undefined;
  let privateKey: string | undefined;

  const keyFile = process.env.GOOGLE_SA_KEY_FILE;
  if (keyFile) {
    try {
      const fullPath = resolve(process.cwd(), keyFile);
      const raw = readFileSync(fullPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        client_email?: string;
        private_key?: string;
      };
      email = parsed.client_email;
      privateKey = parsed.private_key;
    } catch (err) {
      throw new Error(
        `Impossible de lire ${keyFile} : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      );
    }
  } else {
    email = process.env.GOOGLE_SA_EMAIL;
    privateKey = process.env.GOOGLE_SA_PRIVATE_KEY ?? "";
    privateKey = privateKey.trim();
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const sheetId = process.env.PORTFOLIO_SHEET_ID;
  const range = process.env.PORTFOLIO_SHEET_RANGE ?? "Portefeuille!A17:V200";

  if (!email || !privateKey || !sheetId) {
    throw new Error(
      "Portfolio mal configuré : il faut soit GOOGLE_SA_KEY_FILE (chemin vers le JSON SA), soit GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY. Et PORTFOLIO_SHEET_ID est requis.",
    );
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "Private key mal formée : pas de header `-----BEGIN PRIVATE KEY-----` détecté.",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = (res.data.values ?? []) as string[][];
  if (rows.length === 0) {
    throw new Error("Feuille Portefeuille vide ou range incorrect");
  }

  // Auto-détection des colonnes par NOM de header — plus robuste qu'un
  // mapping positionnel rigide (le sheet peut avoir des colonnes masquées,
  // ré-ordonnées, etc.).
  const headers = rows[0].map((h) => (h ?? "").toString());

  const findCol = (...candidates: string[]): number => {
    for (const cand of candidates) {
      const norm = cand.toLowerCase().replace(/\s+/g, " ").trim();
      const idx = headers.findIndex((h) =>
        h.toLowerCase().replace(/\s+/g, " ").trim().includes(norm),
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const cols = {
    ticker: findCol("ticker"),
    name: findCol("name", "nom"),
    sector: findCol("secteur"),
    quantity: findCol("nombre", "quantit", "qty"),
    pru: findCol("pru", "prix d'achat", "prix moyen"),
    price: findCol("price", "prix actuel", "cours"),
    varDayPct: findCol("variation journali"), // matche "VARIATION JOURNALIERE %"
    currency: findCol("currency", "devise"),
    totalAchat: findCol("total achat"),
    totalActuel: findCol("total actuel"),
    gainEur: findCol("gain €", "gain euro"),
    gainPct: findCol("gain %"),
    account: findCol("compte", "broker"),
    low52: findCol("low 52", "plus bas 52"),
    high52: findCol("high 52", "plus haut 52"),
    divYieldPct: findCol("dividendes %", "rendement"),
    divAnnual: findCol("dividendes annuel"),
    weightPct: findCol("taille", "poids", "weight"),
  };

  // Garde-fou : si on ne trouve même pas TICKER, le range est foireux
  if (cols.ticker < 0) {
    throw new Error(
      `Header "TICKER" introuvable. Headers détectés : ${headers.join(" | ")}`,
    );
  }

  const get = (row: string[], colIdx: number): string =>
    colIdx >= 0 && row[colIdx] != null ? String(row[colIdx]) : "";
  const getNum = (row: string[], colIdx: number): number | null =>
    colIdx >= 0 ? parseNum(row[colIdx]) : null;

  const dataRows = rows
    .slice(1)
    .filter((r) => {
      const ticker = get(r, cols.ticker).trim();
      if (!ticker) return false;
      // Exclut les lignes "section" / dashboard / lignes #REF! sans données
      // réelles. Une vraie position a un PRU ET (un PRICE OU une qty).
      const name = get(r, cols.name).trim();
      if (name.startsWith("#REF") || name.startsWith("#N/A")) return false;
      const pru = getNum(r, cols.pru);
      const price = getNum(r, cols.price);
      const qty = getNum(r, cols.quantity);
      return pru != null && (price != null || qty != null);
    });

  const positions: Position[] = dataRows.map((r) => ({
    ticker: get(r, cols.ticker).trim(),
    name: get(r, cols.name).trim(),
    sector: get(r, cols.sector).trim(),
    quantity: getNum(r, cols.quantity),
    pru: getNum(r, cols.pru),
    price: getNum(r, cols.price),
    varDayPct: getNum(r, cols.varDayPct),
    currency: get(r, cols.currency).trim(),
    totalAchat: getNum(r, cols.totalAchat),
    totalActuel: getNum(r, cols.totalActuel),
    gainEur: getNum(r, cols.gainEur),
    gainPct: getNum(r, cols.gainPct),
    account: get(r, cols.account).trim(),
    low52: getNum(r, cols.low52),
    high52: getNum(r, cols.high52),
    divYieldPct: getNum(r, cols.divYieldPct),
    divAnnual: getNum(r, cols.divAnnual),
    weightPct: getNum(r, cols.weightPct),
  }));

  // Totaux agrégés (recalculés côté serveur, source de vérité)
  const totalAchat = positions.reduce((s, p) => s + (p.totalAchat ?? 0), 0);
  const totalActuel = positions.reduce((s, p) => s + (p.totalActuel ?? 0), 0);
  const gainEur = totalActuel - totalAchat;
  const gainPct = totalAchat > 0 ? (gainEur / totalAchat) * 100 : 0;

  const snapshot: PortfolioSnapshot = {
    positions,
    totals: {
      totalAchat: Math.round(totalAchat * 100) / 100,
      totalActuel: Math.round(totalActuel * 100) / 100,
      gainEur: Math.round(gainEur * 100) / 100,
      gainPct: Math.round(gainPct * 100) / 100,
      count: positions.length,
    },
    fetchedAt: new Date().toISOString(),
  };

  cache = { data: snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
  return snapshot;
}

/**
 * Filtres optionnels pour le LLM (réduit le payload envoyé au modèle).
 */
export interface PortfolioFilter {
  ticker?: string;
  account?: string;
  sector?: string;
  topN?: number; // top N par valeur actuelle (TOTAL ACTUEL)
}

export function filterPortfolio(
  snap: PortfolioSnapshot,
  filter: PortfolioFilter = {},
): PortfolioSnapshot {
  let positions = snap.positions;
  if (filter.ticker) {
    const q = filter.ticker.toLowerCase();
    positions = positions.filter(
      (p) =>
        p.ticker.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    );
  }
  if (filter.account) {
    const q = filter.account.toLowerCase();
    positions = positions.filter((p) => p.account.toLowerCase().includes(q));
  }
  if (filter.sector) {
    const q = filter.sector.toLowerCase();
    positions = positions.filter((p) => p.sector.toLowerCase().includes(q));
  }
  if (filter.topN && filter.topN > 0) {
    positions = [...positions]
      .sort((a, b) => (b.totalActuel ?? 0) - (a.totalActuel ?? 0))
      .slice(0, filter.topN);
  }
  return { ...snap, positions };
}
