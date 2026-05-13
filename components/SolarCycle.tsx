"use client";

import { useEffect, useState } from "react";
import type { UserLocation } from "@/types";

interface Props {
  userLocation?: UserLocation | null;
}

interface SunData {
  sunrise: string; // "06:24"
  sunset: string;  // "21:38"
  uvIndex: number;
  daylightPct: number; // 0..1 où on en est dans la journée solaire
}

/**
 * Phase de la lune approximative (suffisante pour de la déco).
 * Source : algorithme de Conway. Renvoie 0..1 (0/1 = nouvelle lune, 0.5 = pleine lune).
 */
function moonPhase(date: Date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  let r = y % 100;
  r %= 19;
  if (r > 9) r -= 19;
  r = ((r * 11) % 30) + m + d;
  if (m < 3) r += 2;
  r -= y < 2000 ? 4 : 8.3;
  r = ((r + 30) % 30) / 29.53;
  return Math.max(0, Math.min(1, r));
}

function moonGlyph(phase: number): string {
  // 8 phases canoniques
  if (phase < 0.06 || phase > 0.94) return "🌑";
  if (phase < 0.18) return "🌒";
  if (phase < 0.31) return "🌓";
  if (phase < 0.44) return "🌔";
  if (phase < 0.56) return "🌕";
  if (phase < 0.69) return "🌖";
  if (phase < 0.81) return "🌗";
  return "🌘";
}

function moonLabel(phase: number): string {
  if (phase < 0.06 || phase > 0.94) return "NOUVELLE";
  if (phase < 0.25) return "1ER CROISSANT";
  if (phase < 0.30) return "1ER QUARTIER";
  if (phase < 0.44) return "GIBB. CROISS.";
  if (phase < 0.56) return "PLEINE";
  if (phase < 0.69) return "GIBB. DÉCR.";
  if (phase < 0.81) return "DERN. QUARTIER";
  return "DERN. CROISSANT";
}

/**
 * SolarCycle — bloc haut-gauche (lg+) avec lever/coucher du soleil,
 * indice UV, et phase de la lune. Récupère les données via Open-Meteo
 * une fois userLocation disponible. Re-fetch toutes les heures.
 */
export function SolarCycle({ userLocation }: Props) {
  const [sun, setSun] = useState<SunData | null>(null);

  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    const fetchSun = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${userLocation.lat}&longitude=${userLocation.lng}&daily=sunrise,sunset,uv_index_max&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;
        const sunriseStr = data?.daily?.sunrise?.[0];
        const sunsetStr = data?.daily?.sunset?.[0];
        const uv = data?.daily?.uv_index_max?.[0];
        if (!sunriseStr || !sunsetStr) return;
        const sunrise = new Date(sunriseStr);
        const sunset = new Date(sunsetStr);
        const now = new Date();
        const total = sunset.getTime() - sunrise.getTime();
        const elapsed = Math.max(
          0,
          Math.min(total, now.getTime() - sunrise.getTime()),
        );
        setSun({
          sunrise: sunrise.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          sunset: sunset.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          uvIndex: typeof uv === "number" ? uv : 0,
          daylightPct: total > 0 ? elapsed / total : 0,
        });
      } catch {
        // Silencieux : c'est de la déco
      }
    };
    void fetchSun();
    const id = setInterval(fetchSun, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userLocation]);

  const phase = moonPhase();

  return (
    <div className="hidden lg:flex pointer-events-none absolute right-4 top-36 xl:top-40 z-20 flex-col gap-1.5 hologram-flicker">
      {/* Bloc soleil */}
      <div className="flex flex-col gap-0.5 items-end">
        <div className="font-mono text-[8px] tracking-[0.4em] text-jarvis-cyan/55">
          SOLAR
        </div>
        <div className="font-display tracking-[0.18em] text-[11px] text-jarvis-cyan glow-text-soft tabular-nums">
          ↑ {sun?.sunrise ?? "--:--"}  ·  ↓ {sun?.sunset ?? "--:--"}
        </div>
        {/* Barre de progression du jour solaire */}
        <div className="relative h-[2px] w-[120px] bg-jarvis-cyan/15 rounded-full overflow-hidden mt-0.5">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${(sun?.daylightPct ?? 0) * 100}%`,
              background:
                "linear-gradient(90deg, #ffd166, #67e8f9, #0a84ff)",
              boxShadow: "0 0 6px rgba(255,209,102,0.7)",
            }}
          />
        </div>
        <div className="font-mono text-[8.5px] text-jarvis-muted tabular-nums">
          UV  <span className="text-jarvis-cyan">{sun?.uvIndex.toFixed(1) ?? "—"}</span>
        </div>
      </div>

      {/* Bloc lune */}
      <div className="flex flex-col gap-0.5 items-end mt-1.5">
        <div className="font-mono text-[8px] tracking-[0.4em] text-jarvis-cyan/55">
          LUNAR
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base leading-none" style={{ filter: "drop-shadow(0 0 4px rgba(103,232,249,0.5))" }}>
            {moonGlyph(phase)}
          </span>
          <span className="font-display tracking-[0.18em] text-[10px] text-jarvis-cyan/85">
            {moonLabel(phase)}
          </span>
        </div>
      </div>
    </div>
  );
}
