/**
 * Rate limiter en mémoire (sliding window) pour les routes API.
 *
 * Limite : par IP (X-Forwarded-For ou socket), N requêtes / fenêtre.
 * Pas de Redis : OK pour app perso 1 instance. Si on scale, switch sur
 * `@upstash/ratelimit`.
 *
 * Usage :
 *   const limited = rateLimit(req, "chat", 30, 60_000);
 *   if (limited) return limited; // 429
 */

type WindowKey = string;
const buckets = new Map<WindowKey, number[]>();

function getClientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Renvoie une `Response` 429 si le client a dépassé son quota, sinon `null`
 * (la route peut continuer normalement).
 *
 * @param req     La requête entrante
 * @param scope   Identifiant logique (ex: "chat", "tts") pour isoler les quotas
 * @param maxReq  Nombre max de requêtes dans la fenêtre
 * @param windowMs Durée de la fenêtre glissante en ms
 */
export function rateLimit(
  req: Request,
  scope: string,
  maxReq: number,
  windowMs: number,
): Response | null {
  const ip = getClientKey(req);
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= maxReq) {
    const oldest = timestamps[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: `Trop de requêtes. Réessaie dans ${retryAfterSec}s.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(maxReq),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  // Nettoyage opportuniste : 1% des appels purgent les vieux buckets
  if (Math.random() < 0.01) {
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }

  return null;
}
