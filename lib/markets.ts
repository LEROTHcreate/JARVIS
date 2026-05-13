/**
 * Cotations actions et cryptos en temps réel.
 *
 *   - Actions / ETF : Yahoo Finance v8 (endpoint chart non officiel mais
 *     largement utilisé, gratuit, sans clé). Le ticker doit inclure le suffixe
 *     bourse pour les non-US : `AIR.PA` (Paris), `BMW.DE` (Francfort),
 *     `VOD.L` (Londres), `7203.T` (Tokyo). Sans suffixe = US (NYSE/NASDAQ).
 *
 *   - Cryptos : CoinGecko `/simple/price` (gratuit, 30 req/min sans clé).
 *     L'utilisateur peut passer le symbole (`BTC`, `ETH`) ; on résout via
 *     `/search` pour récupérer l'id CoinGecko interne (`bitcoin`, `ethereum`).
 *
 * Pourquoi pas Alpha Vantage / Twelve Data : ils demandent une clé et ont
 * des quotas serrés (5 req/min). Yahoo non-officiel + CoinGecko = robuste
 * + zéro setup, c'est exactement ce qu'on veut.
 */

const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const COINGECKO_URL = "https://api.coingecko.com/api/v3";
// Yahoo refuse certaines requêtes sans UA "navigateur". On en met un raisonnable.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 JARVIS/1.0";

export interface StockQuote {
  ticker: string;
  name: string | null;
  exchange: string | null;
  price: number;
  currency: string;
  changeAbs: number;
  changePct: number;
  previousClose: number;
  marketState: string | null;
  date: string; // ISO timestamp dernière update
}

export interface CryptoPrice {
  symbol: string;
  /** id CoinGecko interne (ex: 'bitcoin') */
  id: string;
  name: string;
  prices: {
    [currency: string]: {
      price: number;
      changePct24h: number | null;
    };
  };
}

/**
 * Cours d'une action / ETF via Yahoo. Le ticker doit être au format Yahoo
 * (AAPL, MSFT, AIR.PA, BMW.DE, VOD.L, etc.). On retourne le prix actuel
 * (regularMarketPrice) avec la variation depuis le close précédent.
 */
export async function getStockQuote(ticker: string): Promise<StockQuote> {
  const t = ticker.trim().toUpperCase();
  if (!t) throw new Error("Ticker manquant.");
  const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(
    t,
  )}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(
      `Yahoo Finance ${res.status} pour ${t} (vérifier le format : 'AAPL' pour US, 'AIR.PA' pour Paris, 'BMW.DE' pour Francfort).`,
    );
  }
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") {
    throw new Error(
      `Ticker '${t}' introuvable ou pas de donnée. Format attendu : AAPL, AIR.PA, BMW.DE, VOD.L, 7203.T.`,
    );
  }
  const price: number = meta.regularMarketPrice;
  const prev: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const changeAbs = price - prev;
  const changePct = prev > 0 ? (changeAbs / prev) * 100 : 0;
  return {
    ticker: t,
    name: meta.longName ?? meta.shortName ?? null,
    exchange: meta.exchangeName ?? meta.fullExchangeName ?? null,
    price: Math.round(price * 10000) / 10000,
    currency: meta.currency ?? "USD",
    changeAbs: Math.round(changeAbs * 10000) / 10000,
    changePct: Math.round(changePct * 100) / 100,
    previousClose: Math.round(prev * 10000) / 10000,
    marketState: meta.marketState ?? null,
    date: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Résout un symbole crypto (BTC) → id CoinGecko (bitcoin) via le endpoint
 * `/search`. Les résultats sont triés par market cap, donc le 1er match
 * exact sur `symbol` est presque toujours le bon coin.
 */
async function resolveCoinId(symbol: string): Promise<{
  id: string;
  name: string;
  symbol: string;
} | null> {
  const q = symbol.trim().toLowerCase();
  // Raccourcis : on hardcode les top 5 pour éviter une requête /search dans
  // les cas les plus communs. Le reste passe par /search.
  const HARDCODED: Record<string, { id: string; name: string }> = {
    btc: { id: "bitcoin", name: "Bitcoin" },
    eth: { id: "ethereum", name: "Ethereum" },
    sol: { id: "solana", name: "Solana" },
    bnb: { id: "binancecoin", name: "BNB" },
    xrp: { id: "ripple", name: "XRP" },
    ada: { id: "cardano", name: "Cardano" },
    doge: { id: "dogecoin", name: "Dogecoin" },
    matic: { id: "matic-network", name: "Polygon" },
    dot: { id: "polkadot", name: "Polkadot" },
    avax: { id: "avalanche-2", name: "Avalanche" },
  };
  if (HARDCODED[q]) return { ...HARDCODED[q], symbol: q.toUpperCase() };

  const res = await fetch(
    `${COINGECKO_URL}/search?query=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": "JARVIS/1.0" } },
  );
  if (!res.ok) throw new Error(`CoinGecko search ${res.status}`);
  const data = await res.json();
  const coins: Array<{ id: string; symbol: string; name: string }> =
    data?.coins ?? [];
  // On cherche un match exact sur le symbole (ex: BTC == BTC), pas un coin
  // qui contient BTC dans son nom (sinon wBTC etc. polluent le résultat).
  const exact = coins.find((c) => c.symbol.toLowerCase() === q);
  const pick = exact ?? coins[0];
  if (!pick) return null;
  return { id: pick.id, name: pick.name, symbol: pick.symbol.toUpperCase() };
}

/**
 * Cours d'une crypto dans une ou plusieurs devises (défaut: USD + EUR).
 * Inclut la variation 24h en %.
 */
export async function getCryptoPrice(
  symbol: string,
  vsCurrencies: string[] = ["usd", "eur"],
): Promise<CryptoPrice> {
  const coin = await resolveCoinId(symbol);
  if (!coin) {
    throw new Error(
      `Crypto '${symbol}' introuvable sur CoinGecko. Essaye avec le ticker exact (BTC, ETH, SOL...) ou le nom complet.`,
    );
  }
  const vs = vsCurrencies.map((c) => c.toLowerCase()).join(",");
  const url = `${COINGECKO_URL}/simple/price?ids=${encodeURIComponent(
    coin.id,
  )}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`;
  const res = await fetch(url, { headers: { "User-Agent": "JARVIS/1.0" } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json();
  const raw = data?.[coin.id];
  if (!raw) {
    throw new Error(`Pas de cotation pour ${coin.id}.`);
  }
  const prices: CryptoPrice["prices"] = {};
  for (const cur of vsCurrencies) {
    const k = cur.toLowerCase();
    if (typeof raw[k] === "number") {
      prices[cur.toUpperCase()] = {
        price: raw[k],
        changePct24h:
          typeof raw[`${k}_24h_change`] === "number"
            ? Math.round(raw[`${k}_24h_change`] * 100) / 100
            : null,
      };
    }
  }
  return {
    symbol: coin.symbol,
    id: coin.id,
    name: coin.name,
    prices,
  };
}
