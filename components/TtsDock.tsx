"use client";

interface Props {
  /** Provider qui a effectivement servi la dernière requête TTS, via le
   *  header `X-TTS-Provider` côté serveur. */
  provider?: "cartesia" | "elevenlabs" | "elevenlabs-ultron" | null;
  /** État du dernier appel TTS */
  status?: "ok" | "pending" | "error" | "idle";
  /** Latence du dernier fetch /api/tts en ms */
  lastLatencyMs?: number | null;
  /** Nombre cumulé de caractères envoyés en TTS pour la session courante */
  charsThisSession?: number;
}

// Quotas approximatifs des tiers gratuits — affichés à titre indicatif
// (on ne récupère pas le vrai compteur en temps réel depuis l'API).
const FREE_QUOTA: Record<string, number> = {
  cartesia: 100_000,
  elevenlabs: 10_000,
  "elevenlabs-ultron": 10_000,
};

const PROVIDER_LABEL: Record<string, string> = {
  cartesia: "CARTESIA",
  elevenlabs: "ELEVENLABS",
  "elevenlabs-ultron": "EL · ULTRON",
};

/**
 * Panneau HUD bas-gauche, à droite du PerfDock : statut TTS (provider
 * actif, quota free tier restant, latence, chars consommés en session).
 */
export function TtsDock({
  provider,
  status = "idle",
  lastLatencyMs,
  charsThisSession = 0,
}: Props) {
  const statusColor = {
    ok: "#67e8f9",
    pending: "#ffd166",
    error: "#ff3b6c",
    idle: "rgba(122,144,184,0.4)",
  }[status];
  const statusLabel = {
    ok: "OK",
    pending: "SYNTH...",
    error: "ERROR",
    idle: "STANDBY",
  }[status];

  const providerLabel = provider ? PROVIDER_LABEL[provider] : "—";
  const quota = provider ? FREE_QUOTA[provider] : null;

  const latencyText =
    lastLatencyMs == null
      ? "—"
      : lastLatencyMs < 1000
        ? `${Math.round(lastLatencyMs)}ms`
        : `${(lastLatencyMs / 1000).toFixed(2)}s`;

  const charsText = `${charsThisSession.toLocaleString("fr-FR")}`;
  // Reste estimé : quota free tier − chars consommés cette session
  // (approximation : ne tient pas compte de l'usage hors session).
  const remainingText =
    quota != null
      ? `~${Math.max(0, quota - charsThisSession).toLocaleString("fr-FR")} / ${(quota / 1000).toFixed(0)}k`
      : "—";

  return (
    <div
      className="hidden lg:flex pointer-events-none absolute left-[210px] xl:left-[235px] bottom-20 xl:bottom-24 z-20 flex-col gap-1 hologram-flicker"
      aria-hidden
      style={{ minWidth: "175px" }}
    >
      <div className="flex items-center gap-2">
        <div
          className={`h-[5px] w-[5px] rounded-full ${status === "pending" ? "animate-pulse" : ""}`}
          style={{
            background: statusColor,
            boxShadow:
              status !== "idle" ? `0 0 6px ${statusColor}` : undefined,
          }}
        />
        <span className="font-display text-[8px] tracking-[0.4em] text-jarvis-cyan/70">
          TTS
        </span>
        <span
          className="font-mono text-[8px] tracking-widest tabular-nums"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      <Row label="VOICE" value={providerLabel} />
      <Row label="LATENCY" value={latencyText} />
      <Row label="SESSION" value={`${charsText} chars`} />
      <Row label="QUOTA" value={remainingText} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[8px] tracking-[0.25em] text-jarvis-muted/55">
        {label}
      </span>
      <span className="font-mono text-[9.5px] text-jarvis-cyan/80 tabular-nums truncate max-w-[120px]">
        {value}
      </span>
    </div>
  );
}
