"use client";

import { motion } from "framer-motion";

interface Props {
  blackout: boolean;
  blackoutDurationMs: number;
  wakingDurationMs: number;
}

/**
 * Overlay noir total qui simule un "réveil". Pendant la phase blackout,
 * une pulsation cyan apparaît au centre et s'intensifie progressivement
 * jusqu'à atteindre la taille du cœur du réacteur (≈ 84px). À la fin du
 * blackout, l'overlay noir fade-out et révèle l'orbe juste construit
 * dessous : le point cyan se confond alors visuellement avec le cœur
 * lumineux du réacteur, donnant l'illusion d'une transition continue.
 *
 * Centrage : on reproduit exactement la même géométrie que la section
 * orbe (`absolute inset-0 grid place-items-center px-4`) pour que le
 * point soit pile à l'endroit où le réacteur sera dessiné.
 */
export function WakeUpOverlay({
  blackout,
  blackoutDurationMs,
  wakingDurationMs,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: blackout ? 1 : 0 }}
      transition={{
        duration: blackout ? 0 : wakingDurationMs / 1000,
        ease: "easeInOut",
      }}
      className="fixed inset-0 z-[110] bg-jarvis-bg pointer-events-none grid place-items-center px-4"
      style={{
        visibility: blackout ? "visible" : "hidden",
        transitionDelay: blackout ? "0s" : `${wakingDurationMs}ms`,
      }}
    >
      {/* Cœur cyan central — pulsation qui croît jusqu'à la taille
          approximative du cœur du réacteur (≈ 84 px). En fin de phase
          blackout, il a déjà l'apparence du noyau lumineux du réacteur,
          de sorte que le fade-out du fond noir révèle un orbe déjà
          "vivant" sans rupture visuelle. */}
      <motion.div
        initial={{ scale: 0.05, opacity: 0 }}
        animate={{
          scale: [0.05, 0.12, 0.1, 0.3, 0.25, 0.6, 0.55, 1],
          opacity: [0, 0.2, 0.15, 0.55, 0.45, 0.85, 0.8, 1],
        }}
        transition={{
          duration: blackoutDurationMs / 1000,
          ease: [0.4, 0, 0.2, 1],
          times: [0, 0.12, 0.2, 0.4, 0.5, 0.75, 0.85, 1],
        }}
        className="h-[84px] w-[84px] rounded-full"
        style={{
          // Gradient calqué sur celui du cœur du réacteur (JarvisOrb)
          background:
            "radial-gradient(circle at 50% 50%, #ffffff 0%, #dbeafe 35%, rgba(103,232,249,0.85) 65%, rgba(0,212,255,0.15) 100%)",
          boxShadow:
            "0 0 24px #00d4ff, 0 0 64px rgba(0,212,255,0.8), 0 0 120px rgba(103,232,249,0.55), 0 0 200px rgba(10,132,255,0.4)",
        }}
      />
    </motion.div>
  );
}
