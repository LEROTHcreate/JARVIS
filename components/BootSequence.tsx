"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  visible: boolean;
  showBar: boolean;
  barDurationMs: number;
}

const BOOT_LINES = [
  "STARTUP_CORE              [ OK ]",
  "NEURAL_LINK               [ OK ]",
  "VOICE_MODULE              [ OK ]",
  "GEOSPATIAL_INDEX          [ OK ]",
  "ANTHROPIC_BRIDGE          [ OK ]",
  "PARTICLE_RENDERER         [ OK ]",
];

/**
 * Panneau de boot intégré DANS l'interface JARVIS (pas un overlay opaque
 * séparé). Affiché en bas de l'écran, au-dessus du chat input. L'orbe et
 * tous les éléments HUD restent visibles pendant le boot.
 */
export function BootSequence({ visible, showBar, barDurationMs }: Props) {
  return (
    <AnimatePresence>
      {visible && showBar && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed inset-0 z-30 grid place-items-center pointer-events-none"
        >
          <div className="glass-panel rounded-xl px-5 py-4 flex flex-col gap-3 w-[min(460px,86vw)]">
            {/* En-tête */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse" />
                <span className="font-display text-[10px] tracking-[0.4em] text-jarvis-cyan">
                  INITIALISATION
                </span>
              </div>
              <span className="font-mono text-[9px] tracking-widest text-jarvis-muted">
                SYSTEM BOOT
              </span>
            </div>

            {/* Barre de chargement */}
            <div className="relative w-full h-[2px] bg-jarvis-cyan/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{
                  duration: barDurationMs / 1000,
                  ease: "easeInOut",
                }}
                className="absolute inset-y-0 left-0 bg-jarvis-cyan rounded-full"
                style={{ boxShadow: "0 0 8px #00d4ff, 0 0 16px #00d4ff" }}
              />
            </div>

            {/* Logs en cascade */}
            <div className="flex flex-col gap-[3px] font-mono text-[10px] text-jarvis-muted/85">
              {BOOT_LINES.map((line, i) => {
                const delay =
                  (i / BOOT_LINES.length) * (barDurationMs / 1000);
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay, duration: 0.18 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-jarvis-cyan/80">›</span>
                    <span className="tracking-wider">{line}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
