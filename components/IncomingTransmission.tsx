"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { JarvisState } from "@/types";

interface Props {
  state: JarvisState;
}

/**
 * Effet visuel déclenché quand JARVIS passe en `speaking` (début de
 * réponse). Affiche un texte "INCOMING TRANSMISSION" qui clignote brièvement
 * + 3 ondes concentriques qui partent du centre de l'orbe vers l'extérieur.
 * Durée totale ~1.1s, non bloquant (pointer-events: none).
 */
export function IncomingTransmission({ state }: Props) {
  const [pulse, setPulse] = useState(0);
  const [prevState, setPrevState] = useState<JarvisState>(state);

  useEffect(() => {
    // Déclenche uniquement à la TRANSITION vers speaking (pas au montage)
    if (state === "speaking" && prevState !== "speaking") {
      setPulse((p) => p + 1);
    }
    setPrevState(state);
  }, [state, prevState]);

  return (
    <AnimatePresence>
      {pulse > 0 && (
        <motion.div
          key={pulse}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onAnimationComplete={(def) => {
            // On retire l'effet après l'animation pour permettre une nouvelle
            // détection au prochain passage en speaking.
            if (typeof def === "object" && (def as { opacity?: number }).opacity === 0) {
              setPulse(0);
            }
          }}
          className="pointer-events-none absolute inset-0 z-[25] overflow-hidden"
        >
          {/* 3 ondes concentriques échelonnées */}
          {[0, 0.18, 0.36].map((delay, i) => (
            <motion.div
              key={`wave-${pulse}-${i}`}
              initial={{ scale: 0, opacity: 0.7 }}
              animate={{ scale: 4.5, opacity: 0 }}
              transition={{ duration: 1.2, delay, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-jarvis-cyan/70"
              style={{
                boxShadow:
                  "0 0 24px rgba(0,212,255,0.45), inset 0 0 24px rgba(103,232,249,0.25)",
              }}
            />
          ))}

          {/* Texte INCOMING TRANSMISSION qui flash en haut centre */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0 }}
            transition={{ duration: 0.9, times: [0, 0.15, 0.7, 1] }}
            className="absolute left-1/2 -top-2 -translate-x-1/2 font-display tracking-[0.45em] text-[10px] sm:text-[11px] text-jarvis-cyan glow-text-soft whitespace-nowrap"
          >
            ▸ INCOMING TRANSMISSION ◂
          </motion.div>

          {/* Mini-flashs latéraux (effet "lock-on") */}
          {[
            { x: "-50%", y: "50%", dx: "-220px", dy: "0px" },
            { x: "50%", y: "50%", dx: "220px", dy: "0px" },
          ].map((p, i) => (
            <motion.div
              key={`flash-${pulse}-${i}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1] }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.05 }}
              className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-jarvis-white"
              style={{
                transform: `translate(calc(${p.x} + ${p.dx}), calc(${p.y} + ${p.dy} - 50%))`,
                boxShadow:
                  "0 0 8px #f0f9ff, 0 0 16px #00d4ff, 0 0 32px rgba(0,212,255,0.6)",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
