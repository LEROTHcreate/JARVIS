/**
 * Conversion de devises via Frankfurter (https://www.frankfurter.app/).
 *
 * - Gratuit, illimité, sans clé API
 * - Taux quotidiens publiés par la Banque Centrale Européenne (BCE)
 * - Couvre 33 devises (EUR, USD, GBP, JPY, CHF, AUD, CAD, CNY, etc.) — pas
 *   de crypto, pas de devises exotiques type ARS, NGN. Pour les cryptos,
 *   utiliser `getCryptoPrice` (lib/markets.ts) qui passe par CoinGecko.
 */

const FRANKFURTER_URL = "https://api.frankfurter.app";
const UA = "JARVIS/1.0 (frankfurter client)";

export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
  result: number;
  /** Taux unitaire utilisé (1 unité de `from` = `rate` unités de `to`). */
  rate: number;
  /** Date du taux BCE (YYYY-MM-DD). */
  date: string;
}

/**
 * Convertit `amount` unités de `from` en `to`. Le serveur Frankfurter gère
 * le change directement — on appelle une seule fois et on récupère le total.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<CurrencyConversion> {
  if (!Number.isFinite(amount))
    throw new Error("Montant invalide (doit être un nombre fini).");
  if (amount < 0) throw new Error("Montant négatif non supporté.");

  const fromUp = from.toUpperCase().trim();
  const toUp = to.toUpperCase().trim();
  if (fromUp === toUp) {
    return {
      amount,
      from: fromUp,
      to: toUp,
      result: amount,
      rate: 1,
      date: new Date().toISOString().slice(0, 10),
    };
  }

  const url = `${FRANKFURTER_URL}/latest?amount=${amount}&from=${encodeURIComponent(
    fromUp,
  )}&to=${encodeURIComponent(toUp)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Frankfurter ${res.status}: ${body.slice(0, 120) || "erreur"}`,
    );
  }
  const data = await res.json();
  const result = data?.rates?.[toUp];
  if (typeof result !== "number") {
    throw new Error(
      `Devise non supportée (${fromUp} → ${toUp}). Frankfurter couvre 33 devises BCE — pour les cryptos utilise get_crypto_price.`,
    );
  }
  // Taux unitaire = result / amount (Frankfurter renvoie déjà le total)
  const rate = amount > 0 ? result / amount : 0;
  return {
    amount,
    from: fromUp,
    to: toUp,
    result: Math.round(result * 10000) / 10000,
    rate: Math.round(rate * 100000) / 100000,
    date: data.date ?? new Date().toISOString().slice(0, 10),
  };
}
