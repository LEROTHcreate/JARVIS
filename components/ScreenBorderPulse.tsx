"use client";

import { useEffect, useRef, useState } from "react";
import type { JarvisState } from "@/types";

interface Props {
  state: JarvisState;
  audioLevel?: number;
}

/**
 * ScreenBorderPulse — fine bordure cyan tout autour du viewport,
 * réactive à l'état de JARVIS.
 *
 *  - idle      : invisible / quasi-imperceptible (1% opacity, statique)
 *  - listening : pulse rapide d'amplitude liée au volume du micro
 *  - thinking  : "comète" lumineuse qui parcourt le périmètre en boucle
 *  - speaking  : double pulsation calme, plus intense aux pics audio
 *
 * Composé de 4 segments (top / right / bottom / left) qui peuvent
 * s'animer indépendamment pour donner l'effet "scan périmétrique".
 */
export function ScreenBorderPulse({ state, audioLevel = 0 }: Props) {
  const [progress, setProgress] = useState(0); // 0..4 → quel segment + offset
  const rafRef = useRef<number>(0);

  // Anime le cycle quand state == thinking
  useEffect(() => {
    if (state !== "thinking") {
      setProgress(0);
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // Cycle complet en 2.5s → 1.6 segments/s
      setProgress((p) => (p + dt * 1.6) % 4);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  // Détermine l'opacité de chaque segment selon l'état
  const segmentOpacity = (segIndex: number): number => {
    if (state === "idle") return 0;
    if (state === "listening") return 0.4 + audioLevel * 0.6;
    if (state === "speaking") return 0.3 + audioLevel * 0.5;
    if (state === "thinking") {
      // Une "comète" qui parcourt les segments → opacité max sur celui actif
      const dist = Math.min(
        Math.abs(progress - segIndex),
        4 - Math.abs(progress - segIndex),
      );
      // dist 0 → 1, dist 1+ → 0
      return Math.max(0, 1 - dist);
    }
    return 0;
  };

  // Glow intensity selon l'état
  const glowSize = (segIndex: number): number => {
    const o = segmentOpacity(segIndex);
    return 4 + o * 20;
  };

  // Pour thinking : on dessine 2 segments adjacents qui se chevauchent
  // pour avoir une transition fluide entre les côtés.

  const baseColor = state === "speaking" ? "240,249,255" : "0,212,255";

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[16] pointer-events-none"
      style={{ transition: "opacity 400ms" }}
    >
      {/* Trace permanente très subtile pour suggérer le contour */}
      {state !== "idle" && (
        <>
          {/* TOP */}
          <Segment
            position="top"
            opacity={segmentOpacity(0)}
            glow={glowSize(0)}
            color={baseColor}
          />
          {/* RIGHT */}
          <Segment
            position="right"
            opacity={segmentOpacity(1)}
            glow={glowSize(1)}
            color={baseColor}
          />
          {/* BOTTOM */}
          <Segment
            position="bottom"
            opacity={segmentOpacity(2)}
            glow={glowSize(2)}
            color={baseColor}
          />
          {/* LEFT */}
          <Segment
            position="left"
            opacity={segmentOpacity(3)}
            glow={glowSize(3)}
            color={baseColor}
          />
        </>
      )}

      {/* 4 corners qui s'illuminent quand thinking pour matérialiser
          le passage de la "comète". */}
      {state === "thinking" && (
        <>
          <Corner pos="top-left" pulse={progress < 0.5 || progress > 3.5} />
          <Corner pos="top-right" pulse={progress > 0.5 && progress < 1.5} />
          <Corner pos="bottom-right" pulse={progress > 1.5 && progress < 2.5} />
          <Corner pos="bottom-left" pulse={progress > 2.5 && progress < 3.5} />
        </>
      )}
    </div>
  );
}

function Segment({
  position,
  opacity,
  glow,
  color,
}: {
  position: "top" | "right" | "bottom" | "left";
  opacity: number;
  glow: number;
  color: string; // "r,g,b"
}) {
  const isHorizontal = position === "top" || position === "bottom";
  const gradient = isHorizontal
    ? `linear-gradient(90deg, transparent 0%, rgba(${color},${opacity}) 20%, rgba(${color},${opacity}) 80%, transparent 100%)`
    : `linear-gradient(180deg, transparent 0%, rgba(${color},${opacity}) 20%, rgba(${color},${opacity}) 80%, transparent 100%)`;
  const positionStyles: React.CSSProperties =
    position === "top"
      ? { top: 0, left: 0, right: 0, height: "2px" }
      : position === "bottom"
        ? { bottom: 0, left: 0, right: 0, height: "2px" }
        : position === "left"
          ? { top: 0, bottom: 0, left: 0, width: "2px" }
          : { top: 0, bottom: 0, right: 0, width: "2px" };
  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        background: gradient,
        boxShadow: `0 0 ${glow}px rgba(${color},${opacity * 0.8})`,
        transition: "opacity 80ms linear, box-shadow 80ms linear",
      }}
    />
  );
}

function Corner({
  pos,
  pulse,
}: {
  pos: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  pulse: boolean;
}) {
  const positionStyles: React.CSSProperties =
    pos === "top-left"
      ? { top: 0, left: 0 }
      : pos === "top-right"
        ? { top: 0, right: 0 }
        : pos === "bottom-left"
          ? { bottom: 0, left: 0 }
          : { bottom: 0, right: 0 };
  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        width: "14px",
        height: "14px",
        background:
          "radial-gradient(circle, rgba(103,232,249,0.95) 0%, rgba(0,212,255,0.3) 50%, transparent 70%)",
        opacity: pulse ? 1 : 0,
        transition: "opacity 200ms",
        filter: "blur(0.5px)",
      }}
    />
  );
}
