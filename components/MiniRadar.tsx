"use client";

import { useEffect, useState } from "react";
import type { MapPin, UserLocation } from "@/types";

interface Props {
  userLocation?: UserLocation;
  pins?: MapPin[];
  /** Rayon affiché en mètres (défaut 2000m). */
  rangeMeters?: number;
}

/**
 * MiniRadar — un petit radar circulaire style cockpit JARVIS.
 * - Centre = position utilisateur
 * - Ping rotatif (balaie 360° en 3s)
 * - 3 cercles de graduation concentriques
 * - Marqueurs cardinaux N/E/S/W
 * - Pins POI placés selon leur (lat, lng) relatifs à userLocation
 *
 * Masqué sur petits écrans (md+).
 */
export function MiniRadar({
  userLocation,
  pins = [],
  rangeMeters = 2000,
}: Props) {
  const [pingAngle, setPingAngle] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPingAngle((a) => (a + 6) % 360);
    }, 50); // 6° toutes les 50ms = tour complet en 3s
    return () => clearInterval(id);
  }, []);

  // Conversion (lat,lng) → (x,y) sur le radar.
  // Approximation locale : 1° lat ≈ 111 km, 1° lng ≈ 111 * cos(lat) km.
  const projectPin = (
    pin: MapPin,
    me: UserLocation,
  ): { x: number; y: number; visible: boolean } => {
    const dLat = (pin.lat - me.lat) * 111_000;
    const dLng =
      (pin.lng - me.lng) * 111_000 * Math.cos((me.lat * Math.PI) / 180);
    // Sur le radar : N=haut → -y, E=droite → +x
    const x = dLng;
    const y = -dLat;
    const dist = Math.sqrt(x * x + y * y);
    const visible = dist <= rangeMeters;
    // Normalise sur le rayon viewBox (50 unités pour cohérence avec viewBox 100x100)
    const scale = 48 / rangeMeters;
    return { x: x * scale, y: y * scale, visible };
  };

  const projected = userLocation
    ? pins.map((p) => ({ pin: p, pos: projectPin(p, userLocation) }))
    : [];
  const visibleCount = projected.filter((p) => p.pos.visible).length;

  return (
    <div className="hidden md:block lg:hidden pointer-events-none absolute right-4 bottom-32 z-20 hologram-flicker">
      {/* Label haut */}
      <div className="mb-1 flex items-center justify-between font-mono text-[8px] tracking-[0.25em] text-jarvis-cyan/60">
        <span>RADAR</span>
        <span className="text-jarvis-cyan/40">
          {(rangeMeters / 1000).toFixed(1)}KM
        </span>
      </div>

      <div className="relative h-[148px] w-[148px]">
        {/* Halo cyan diffus */}
        <div className="absolute inset-0 rounded-full aura-cyan opacity-70" />

        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor="#0a1428"
                stopOpacity="0.55"
              />
              <stop offset="100%" stopColor="#03060d" stopOpacity="0.85" />
            </radialGradient>
            {/* Le cône de ping : un gradient angulaire émulé via un triangle
                avec gradient linéaire qu'on fait tourner. */}
            <radialGradient id="pingFade" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="rgba(103,232,249,0.45)" />
              <stop offset="100%" stopColor="rgba(0,212,255,0)" />
            </radialGradient>
          </defs>

          {/* Fond du radar */}
          <circle cx="50" cy="50" r="48" fill="url(#radarBg)" />

          {/* Cercles de graduation (3 niveaux) */}
          {[16, 32, 48].map((r) => (
            <circle
              key={r}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="rgba(0,212,255,0.2)"
              strokeWidth="0.4"
              strokeDasharray={r === 48 ? "0" : "1 2"}
            />
          ))}

          {/* Croix axiale */}
          <line
            x1="2"
            y1="50"
            x2="98"
            y2="50"
            stroke="rgba(0,212,255,0.15)"
            strokeWidth="0.3"
          />
          <line
            x1="50"
            y1="2"
            x2="50"
            y2="98"
            stroke="rgba(0,212,255,0.15)"
            strokeWidth="0.3"
          />

          {/* Ping rotatif — un triangle qui tourne avec gradient fade */}
          <g transform={`rotate(${pingAngle} 50 50)`}>
            <path
              d="M 50 50 L 50 2 A 48 48 0 0 1 80 14 Z"
              fill="url(#pingFade)"
            />
            {/* Bord avant du ping (ligne brillante) */}
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="2"
              stroke="rgba(103,232,249,0.9)"
              strokeWidth="0.6"
              style={{ filter: "drop-shadow(0 0 2px #67e8f9)" }}
            />
          </g>

          {/* Pins POI projetés */}
          {projected.map((p, i) => {
            if (!p.pos.visible) return null;
            const px = 50 + p.pos.x;
            const py = 50 + p.pos.y;
            // Effet "détecté" : opacité dépend de la proximité avec le ping
            const pinAngle =
              (Math.atan2(p.pos.x, -p.pos.y) * 180) / Math.PI;
            const angleDiff =
              ((pinAngle - pingAngle + 540) % 360) - 180;
            const recentlySwept = Math.abs(angleDiff) < 30;
            return (
              <g key={i}>
                <circle
                  cx={px}
                  cy={py}
                  r={recentlySwept ? 2 : 1.2}
                  fill={recentlySwept ? "#f0f9ff" : "#00d4ff"}
                  style={{
                    filter: `drop-shadow(0 0 ${recentlySwept ? 4 : 2}px #00d4ff)`,
                    transition: "r 200ms, fill 200ms",
                  }}
                />
              </g>
            );
          })}

          {/* Centre = position user */}
          {userLocation && (
            <>
              <circle
                cx="50"
                cy="50"
                r="2.2"
                fill="#67e8f9"
                style={{ filter: "drop-shadow(0 0 4px #00d4ff)" }}
              />
              <circle
                cx="50"
                cy="50"
                r="4.5"
                fill="none"
                stroke="rgba(103,232,249,0.6)"
                strokeWidth="0.5"
              />
            </>
          )}

          {/* Marqueurs cardinaux */}
          {[
            { label: "N", x: 50, y: 6 },
            { label: "E", x: 94, y: 51.5 },
            { label: "S", x: 50, y: 97 },
            { label: "W", x: 6, y: 51.5 },
          ].map((m) => (
            <text
              key={m.label}
              x={m.x}
              y={m.y}
              fill="rgba(103,232,249,0.7)"
              fontSize="4.5"
              fontFamily="monospace"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {m.label}
            </text>
          ))}

          {/* Anneau extérieur */}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="rgba(0,212,255,0.6)"
            strokeWidth="0.5"
          />
        </svg>

        {/* Indicateur "NO FIX" si pas de position */}
        {!userLocation && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-mono text-[9px] text-jarvis-danger/80 tracking-[0.25em]">
              NO FIX
            </span>
          </div>
        )}
      </div>

      {/* Footer : nombre de POI */}
      <div className="mt-1 text-right font-mono text-[8px] tracking-[0.25em] text-jarvis-cyan/50">
        {visibleCount > 0 ? `${visibleCount} TARGETS` : "SCAN"}
      </div>
    </div>
  );
}
