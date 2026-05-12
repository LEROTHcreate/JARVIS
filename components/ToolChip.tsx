"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ActiveTool {
  name: string;
  query: string;
}

// Libellés humains pour les tools connus. Les autres tombent sur leur
// nom brut en majuscules.
const TOOL_LABELS: Record<string, string> = {
  show_map: "AFFICHAGE CARTOGRAPHIE",
  find_nearby: "RECHERCHE PROXIMITÉ",
  web_search: "RECHERCHE WEB",
  geocode: "GÉOCODAGE",
};

interface Props {
  tool: ActiveTool | null;
}

/**
 * Chip HUD affiché en haut de l'écran quand Claude appelle un tool
 * (find_nearby, show_map, etc.). Rend visible le "travail interne" de
 * l'agent au lieu d'une simple attente noire.
 */
export function ToolChip({ tool }: Props) {
  return (
    <AnimatePresence>
      {tool && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute top-14 sm:top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        >
          <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-3 max-w-[92vw]">
            {/* Mini-spinner rotatif cyan */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "linear",
              }}
              className="h-3 w-3 rounded-full border border-jarvis-cyan border-t-transparent"
              style={{ boxShadow: "0 0 6px rgba(0,212,255,0.6)" }}
            />

            {/* Tag */}
            <span className="font-mono text-[10px] tracking-[0.25em] text-jarvis-cyan/80">
              TOOL
            </span>

            {/* Nom du tool en label humain */}
            <span className="font-display font-medium text-xs tracking-[0.18em] text-jarvis-white">
              {TOOL_LABELS[tool.name] ?? tool.name.toUpperCase()}
            </span>

            {/* Query (tronquée) */}
            {tool.query && (
              <>
                <span className="text-jarvis-cyan/40">›</span>
                <span className="font-body text-xs text-jarvis-muted max-w-[260px] truncate">
                  {tool.query}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
