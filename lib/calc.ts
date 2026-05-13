import { create, all } from "mathjs";

/**
 * Évaluateur mathématique sécurisé pour le tool `calc` de JARVIS.
 *
 * On utilise `mathjs` qui a son propre parser (pas d'eval JS sous-jacent) et
 * qui exclut par défaut les fonctions dangereuses (`import`, `createUnit`,
 * `evaluate`, etc.). On désactive en plus explicitement ces noms via `limited`
 * pour être sûr qu'aucune surface d'attaque ne traîne — paranoia ceinture +
 * bretelles, le tool est appelé par un LLM qui peut produire n'importe quoi.
 *
 * Capacités gardées :
 *   - arithmétique : + - * / ^ %
 *   - fonctions : sqrt, log, ln, exp, sin/cos/tan + asin/acos/atan, abs, round,
 *     floor, ceil, min, max, mean, median, std, variance, gcd, lcm
 *   - constantes : pi, e, tau
 *   - unités : 10 km in mi · 20 °C in °F · 2 kWh in J · 1 GB in MB
 *   - pourcentages : 15% of 1200, 8% + 100, etc.
 *
 * Format retourné : string lisible par le LLM (avec unité si présente).
 */
const math = create(all);
math.import(
  {
    // Override : on annule les fonctions à risque
    import: function () {
      throw new Error("Fonction `import` désactivée.");
    },
    createUnit: function () {
      throw new Error("Fonction `createUnit` désactivée.");
    },
    evaluate: function () {
      throw new Error("Fonction `evaluate` désactivée (récursion bloquée).");
    },
    parse: function () {
      throw new Error("Fonction `parse` désactivée.");
    },
    simplify: function () {
      throw new Error("Fonction `simplify` désactivée.");
    },
    derivative: function () {
      throw new Error("Fonction `derivative` désactivée.");
    },
  },
  { override: true },
);

export interface CalcResult {
  expression: string;
  result: string;
  /** Si la valeur a une unité (ex: "27.5 km/h"), on la retourne séparément. */
  unit: string | null;
}

export function evaluateMath(expression: string): CalcResult {
  const expr = expression.trim();
  if (!expr) throw new Error("Expression vide.");
  if (expr.length > 500)
    throw new Error("Expression trop longue (max 500 caractères).");

  const raw = math.evaluate(expr);

  // mathjs renvoie soit un Number / BigNumber / Fraction, soit une Unit, soit
  // une Matrix. On formate proprement chaque cas.
  if (raw && typeof raw === "object" && "toNumber" in raw && "toString" in raw) {
    // Unit (ex: 27.5 km/h)
    const unitObj = raw as { toString: () => string };
    const str = unitObj.toString();
    const match = str.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s+(.+)$/);
    if (match) {
      return { expression: expr, result: match[1], unit: match[2] };
    }
    return { expression: expr, result: str, unit: null };
  }

  if (typeof raw === "number") {
    // Arrondi à 8 décimales max pour éviter les artefacts flottants
    const rounded = Math.round(raw * 1e8) / 1e8;
    return { expression: expr, result: String(rounded), unit: null };
  }

  if (typeof raw === "boolean") {
    return { expression: expr, result: raw ? "vrai" : "faux", unit: null };
  }

  // Fallback : tout le reste passe par toString()
  return {
    expression: expr,
    result: String(raw),
    unit: null,
  };
}
