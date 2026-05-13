"use client";

import { useMemo } from "react";
import type { ChatMessage } from "@/types";

interface Props {
  messages: ChatMessage[];
  /** Latence du dernier appel API en ms (mesurée par sendMessage) */
  lastLatencyMs?: number | null;
  /** État du dernier appel : ok / pending / error */
  apiStatus?: "ok" | "pending" | "error" | "idle";
  model?: string;
}

// Estimation grossière : ~4 chars / token pour FR/EN
function estimateTokens(messages: ChatMessage[]) {
  return messages.reduce(
    (acc, m) => acc + Math.ceil((m.content?.length ?? 0) / 4),
    0,
  );
}

/**
 * Panneau HUD bas-gauche : statut API live + tokens consommés + modèle
 * actif + nb de requêtes. Toujours visible (lg+), discret en glass.
 */
export function PerfDock({
  messages,
  lastLatencyMs,
  apiStatus = "idle",
  model = "mistral-small",
}: Props) {
  const tokens = useMemo(() => estimateTokens(messages), [messages]);
  const reqCount = messages.filter((m) => m.role === "user").length;

  const statusColor = {
    ok: "#67e8f9",
    pending: "#ffd166",
    error: "#ff3b6c",
    idle: "rgba(122,144,184,0.4)",
  }[apiStatus];
  const statusLabel = {
    ok: "OK",
    pending: "REQ...",
    error: "ERROR",
    idle: "STANDBY",
  }[apiStatus];

  // Format latence : "342ms" / "1.2s" / "—"
  const latencyText =
    lastLatencyMs == null
      ? "—"
      : lastLatencyMs < 1000
        ? `${Math.round(lastLatencyMs)}ms`
        : `${(lastLatencyMs / 1000).toFixed(2)}s`;

  return (
    <div
      className="hidden lg:flex pointer-events-none absolute left-4 xl:left-6 bottom-20 xl:bottom-24 z-20 flex-col gap-1 hologram-flicker"
      aria-hidden
      style={{ minWidth: "175px" }}
    >
      {/* Header avec status pill — texte brut, pas de bulle */}
      <div className="flex items-center gap-2">
        <div
          className={`h-[5px] w-[5px] rounded-full ${apiStatus === "pending" ? "animate-pulse" : ""}`}
          style={{
            background: statusColor,
            boxShadow:
              apiStatus !== "idle" ? `0 0 6px ${statusColor}` : undefined,
          }}
        />
        <span className="font-display text-[8px] tracking-[0.4em] text-jarvis-cyan/70">
          API
        </span>
        <span
          className="font-mono text-[8px] tracking-widest tabular-nums"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      </div>

      <Row label="MODEL" value={model} />
      <Row label="LATENCY" value={latencyText} />
      <Row label="REQUESTS" value={String(reqCount).padStart(3, "0")} />
      <Row label="TOKENS" value={`~${tokens.toLocaleString("fr-FR")}`} />
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
