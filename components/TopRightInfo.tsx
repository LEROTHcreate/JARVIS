"use client";

import { useEffect, useState } from "react";
import type { UserLocation } from "@/types";

interface Props {
  userLocation?: UserLocation | null;
}

// Codes WMO Open-Meteo → libellé court FR
const WEATHER_LABEL: Record<number, string> = {
  0: "CLAIR",
  1: "PEU NUAGEUX",
  2: "PARTIEL",
  3: "COUVERT",
  45: "BROUILLARD",
  48: "BRUME",
  51: "BRUINE",
  53: "BRUINE",
  55: "BRUINE",
  61: "PLUIE",
  63: "PLUIE",
  65: "PLUIE+",
  71: "NEIGE",
  73: "NEIGE",
  75: "NEIGE+",
  80: "AVERSES",
  81: "AVERSES",
  82: "AVERSES",
  95: "ORAGE",
  96: "ORAGE",
  99: "ORAGE",
};

/**
 * Panneau HUD haut-droite : heure live, date, météo locale (Open-Meteo).
 * Discret, glass minimal, toujours visible (lg+).
 */
export function TopRightInfo({ userLocation }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(
    null,
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Météo gratuite Open-Meteo, refresh 10 min
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${userLocation.lat}&longitude=${userLocation.lng}&current_weather=true`,
        );
        const data = await res.json();
        if (!cancelled && data?.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode,
          });
        }
      } catch {
        /* silencieux */
      }
    };
    void fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userLocation]);

  const time = now.toLocaleTimeString("fr-FR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now
    .toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
    .toUpperCase();

  return (
    <div className="hidden lg:flex flex-col items-end gap-0.5 font-mono text-jarvis-cyan/80 tabular-nums leading-tight">
      <div className="text-[14px] tracking-[0.18em] glow-text-soft">{time}</div>
      <div className="text-[9px] tracking-[0.3em] text-jarvis-muted/85">
        {date}
      </div>
      {weather && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] tracking-[0.25em] text-jarvis-cyan/70">
          <span className="font-display font-semibold">{weather.temp}°C</span>
          <span className="text-jarvis-muted/60">·</span>
          <span>{WEATHER_LABEL[weather.code] ?? "—"}</span>
        </div>
      )}
    </div>
  );
}
