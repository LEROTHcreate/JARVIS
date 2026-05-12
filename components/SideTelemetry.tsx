"use client";

import { useEffect, useState } from "react";
import type { UserLocation } from "@/types";

interface Props {
  userLocation?: UserLocation;
}

/**
 * SideTelemetry — bandes verticales discrètes sur les bords gauche/droit
 * affichant des "métriques" stylées. Décoratif, façon panneau de cockpit.
 * Quand `userLocation` est fournie, on affiche les coordonnées GPS réelles
 * à droite pour confirmer visuellement que la géoloc est active.
 *
 * Masqué sur petits écrans (md+).
 */
export function SideTelemetry({ userLocation }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 10000), 400);
    return () => clearInterval(id);
  }, []);

  // Données simulées
  const signal = 70 + Math.floor((Math.sin(tick * 0.07) + 1) * 12);
  const latency = 12 + Math.floor((Math.sin(tick * 0.13) + 1) * 6);
  const freq = (4.2 + Math.sin(tick * 0.05) * 0.3).toFixed(2);
  const bars = 5;
  const activeBars = Math.min(bars, Math.floor(signal / 20) + 1);

  // Coordonnées formatées (signed degrees → "43.296°N 5.370°E")
  const formatLat = (lat: number) =>
    `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`;
  const formatLng = (lng: number) =>
    `${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;

  return (
    <>
      {/* Bande gauche */}
      <div className="hidden md:flex pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-20 flex-col gap-6 hologram-flicker">
        <Block label="SIGNAL" value={`${signal}%`}>
          <div className="flex flex-col-reverse gap-[2px] h-12 w-3">
            {Array.from({ length: bars }).map((_, i) => (
              <div
                key={i}
                className="h-full w-full"
                style={{
                  background:
                    i < activeBars
                      ? "linear-gradient(180deg, #67e8f9, #00d4ff)"
                      : "rgba(0,212,255,0.12)",
                  boxShadow:
                    i < activeBars ? "0 0 6px rgba(0,212,255,0.6)" : undefined,
                }}
              />
            ))}
          </div>
        </Block>
        <Block label="LAT" value={`${latency}ms`} />
        <Block label="FREQ" value={`${freq}GHz`} />
      </div>

      {/* Bande droite — cachée en lg+ pour laisser tout l'espace au chat. */}
      <div className="hidden md:flex lg:hidden pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-20 flex-col gap-6 items-end hologram-flicker">
        <Block
          label="GPS"
          value={userLocation ? "LOCKED" : "PENDING"}
          align="right"
        >
          {userLocation ? (
            <div className="font-mono text-[9px] text-jarvis-cyan/80 tabular-nums">
              <div>{formatLat(userLocation.lat)}</div>
              <div>{formatLng(userLocation.lng)}</div>
            </div>
          ) : (
            <div className="font-mono text-[9px] text-jarvis-danger/70 tracking-widest">
              NO FIX
            </div>
          )}
        </Block>
        <Block label="LINK" value="STABLE" align="right">
          <Dots tick={tick} />
        </Block>
        <Block label="SECTOR" value="0x07A" align="right" />
      </div>
    </>
  );
}

function Block({
  label,
  value,
  align = "left",
  children,
}: {
  label: string;
  value: string;
  align?: "left" | "right";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${align === "right" ? "items-end text-right" : "items-start"}`}
    >
      <div className="font-mono text-[8px] tracking-[0.3em] text-jarvis-cyan/60">
        {label}
      </div>
      <div className="font-display tracking-[0.15em] text-[11px] text-jarvis-cyan glow-text-soft tabular-nums">
        {value}
      </div>
      {children}
    </div>
  );
}

function Dots({ tick }: { tick: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 4 }).map((_, i) => {
        const active = (tick + i) % 6 < 3;
        return (
          <div
            key={i}
            className="h-1 w-1 rounded-full"
            style={{
              background: active ? "#67e8f9" : "rgba(0,212,255,0.15)",
              boxShadow: active ? "0 0 4px #00d4ff" : undefined,
              transition: "background 120ms",
            }}
          />
        );
      })}
    </div>
  );
}
