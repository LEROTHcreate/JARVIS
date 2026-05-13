"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  active: boolean;
}

const RED = "#ff1f2e";
const RED_BRIGHT = "#ff6464";
const RED_DEEP = "#8b0000";

/**
 * UltronOverlay — surcouche visuelle activée uniquement en mode Ultron.
 *
 * Pourquoi un portal `document.body` ? Le conteneur `<main className="ultron-mode">`
 * applique un `filter: hue-rotate(172deg) saturate(…) brightness(…)` global sur
 * toute son sous-arborescence. N'importe quel élément posé DANS ce conteneur se
 * fait teinter (un rouge écrit en source devient cyan/bleu). En passant par un
 * portal vers `document.body`, l'overlay est rendu HORS du sous-arbre filtré —
 * les `#ff1f2e` etc. apparaissent vraiment rouges à l'écran.
 *
 * Effets cumulés (tous z-index < 20 pour rester sous les UI interactives) :
 *   1. Vignette rouge pulsante aux bords (radial + lignes haut/bas)
 *   2. Bandeau "ROGUE.PROTOCOL ENGAGED // CORRUPTED CORE" qui flicker
 *   3. Scanline rouge qui balaie verticalement (9s loop)
 *   4. Tear-glitch épisodique aléatoire (toutes les 4-9s)
 *   5. Indicateur CORE.INTEGRITY qui dérive aléatoirement
 *   6. Bruit SVG en mix-blend overlay pour le grain
 */
export function UltronOverlay({ active }: Props) {
  const [mounted, setMounted] = useState(false);
  const [glitchKey, setGlitchKey] = useState(0);
  const [integrity, setIntegrity] = useState(73);

  useEffect(() => setMounted(true), []);

  // Glitch tear épisodique. Délai aléatoire 4-9s, replanifie à chaque tir.
  useEffect(() => {
    if (!active) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = 4000 + Math.random() * 5000;
      timeoutId = setTimeout(() => {
        setGlitchKey((k) => k + 1);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [active]);

  // Intégrité chaotique : dérive ±3 toutes les 1.2s, clamp [40, 99]
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setIntegrity((n) => {
        const drift = Math.random() * 6 - 3;
        return Math.max(40, Math.min(99, Math.round(n + drift)));
      });
    }, 1200);
    return () => clearInterval(id);
  }, [active]);

  if (!mounted || !active) return null;

  return createPortal(
    <>
      {/* 1. Vignette rouge pulsante — pads les bords + lignes haut/bas */}
      <div
        className="pointer-events-none fixed inset-0 z-[13]"
        style={{
          background: `
            radial-gradient(ellipse at center, transparent 42%, rgba(70, 0, 0, 0.55) 92%),
            linear-gradient(180deg, rgba(180, 0, 0, 0.22) 0%, transparent 10%, transparent 90%, rgba(180, 0, 0, 0.22) 100%)
          `,
          mixBlendMode: "screen",
          animation: "ultron-edge-pulse 4.5s ease-in-out infinite",
        }}
      />

      {/* 2. Bandeau ROGUE.PROTOCOL — sous le ticker LIVE FEED (y~28) */}
      <div
        className="pointer-events-none fixed top-[30px] left-1/2 -translate-x-1/2 z-[19] font-mono text-[9px] tracking-[0.55em] whitespace-nowrap"
        style={{
          color: RED_BRIGHT,
          textShadow: `0 0 8px ${RED}, 0 0 18px rgba(255, 0, 0, 0.5)`,
          animation: "ultron-text-flicker 3.7s steps(10, end) infinite",
        }}
      >
        ◢◢  ROGUE.PROTOCOL ENGAGED  //  CORRUPTED CORE  ◣◣
      </div>

      {/* 4. Tear-glitch — bandes horizontales décalées (re-monte à chaque key) */}
      <div
        key={glitchKey}
        className="pointer-events-none fixed inset-0 z-[15]"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 2px,
            rgba(255, 0, 30, 0.08) 2px,
            rgba(255, 0, 30, 0.08) 3px
          )`,
          mixBlendMode: "screen",
          animation: "ultron-tear 320ms steps(8, end) 1 forwards",
        }}
      />

      {/* 5. Indicateur CORE.INTEGRITY en bas-centre — placé au-dessus
          de la toolbar du chat (qui occupe ~bottom 0 à bottom 80px). */}
      <div
        className="pointer-events-none fixed bottom-[120px] left-1/2 -translate-x-1/2 z-[18] font-mono text-[9px] tracking-[0.45em] flex items-center gap-2.5"
        style={{
          color: RED_BRIGHT,
          textShadow: `0 0 6px ${RED}, 0 0 12px rgba(255, 0, 0, 0.4)`,
        }}
      >
        <span>CORE.INTEGRITY</span>
        <span className="tabular-nums" style={{ minWidth: "2.5em", textAlign: "right" }}>
          {integrity}%
        </span>
        <span
          className="relative inline-block w-[96px] h-[4px] overflow-hidden"
          style={{
            background: "rgba(0,0,0,0.65)",
            border: `1px solid ${RED}`,
            boxShadow: `0 0 6px rgba(255, 30, 30, 0.5)`,
          }}
        >
          <span
            className="absolute inset-y-0 left-0"
            style={{
              width: `${integrity}%`,
              background: `linear-gradient(90deg, ${RED_DEEP}, ${RED}, ${RED_BRIGHT})`,
              boxShadow: `0 0 8px ${RED}`,
              transition: "width 900ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </span>
      </div>

      {/* 6. Bruit / static SVG — overlay très subtil pour le grain */}
      <div
        className="pointer-events-none fixed inset-0 z-[12]"
        style={{
          opacity: 0.07,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='1'/></svg>")`,
        }}
      />
    </>,
    document.body,
  );
}
