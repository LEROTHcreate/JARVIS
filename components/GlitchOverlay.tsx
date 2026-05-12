"use client";

import { useEffect, useState } from "react";

/**
 * GlitchOverlay — déclenche un glitch chromatique léger toutes les
 * 30 à 70 secondes. Animation très courte (~240ms), juste assez pour
 * suggérer une présence "vivante" du système.
 */
export function GlitchOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const schedule = () => {
      // Délai aléatoire entre 30 et 70 secondes
      const delay = 30_000 + Math.random() * 40_000;
      timeout = setTimeout(() => {
        setActive(true);
        setTimeout(() => {
          setActive(false);
          schedule();
        }, 260);
      }, delay);
    };

    schedule();
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[55] pointer-events-none ${active ? "glitch-active" : ""}`}
      style={{
        // Décalage chromatique léger via box-shadow pendant le glitch
        boxShadow: active
          ? "inset 0 0 80px rgba(0, 212, 255, 0.08), inset 0 0 0 1px rgba(255, 59, 108, 0.15)"
          : undefined,
      }}
    />
  );
}
