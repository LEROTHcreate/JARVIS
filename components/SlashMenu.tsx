"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { filterCommands, type JarvisCommand } from "@/lib/commands";

interface Props {
  open: boolean;
  query: string; // ce que l'user a tapé (commence par "/")
  commands: JarvisCommand[];
  selectedIndex: number;
  onSelectIndexChange: (i: number) => void;
  onPick: (cmd: JarvisCommand) => void;
}

/**
 * Menu de slash commands affiché juste au-dessus du champ de saisie.
 * Apparaît dès que l'user tape `/`. Navigation flèches + Enter géré par
 * le parent (ChatInterface), on ne fait que rendre les suggestions filtrées.
 */
export function SlashMenu({
  open,
  query,
  commands,
  selectedIndex,
  onSelectIndexChange,
  onPick,
}: Props) {
  const filtered = useMemo(
    () => filterCommands(commands, query).slice(0, 8),
    [commands, query],
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll auto sur la sélection
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-idx="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden glass-panel border border-jarvis-cyan/20"
          style={{
            boxShadow:
              "0 10px 40px -8px rgba(0,212,255,0.25), 0 0 24px -4px rgba(0,212,255,0.15)",
          }}
        >
          <div className="px-3 py-1.5 border-b border-jarvis-cyan/15 flex items-center justify-between">
            <span className="font-display text-[9px] tracking-[0.4em] text-jarvis-cyan/70">
              COMMANDES
            </span>
            <span className="font-mono text-[9px] text-jarvis-muted/70">
              ↑↓ · ↵
            </span>
          </div>
          <div ref={listRef} className="max-h-[280px] overflow-y-auto thin-scroll">
            {filtered.map((cmd, i) => {
              const active = i === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  data-cmd-idx={i}
                  type="button"
                  onMouseEnter={() => onSelectIndexChange(i)}
                  onClick={() => onPick(cmd)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left transition"
                  style={{
                    background: active
                      ? "rgba(0, 212, 255, 0.12)"
                      : "transparent",
                    borderLeft: active
                      ? "2px solid rgba(0,212,255,0.85)"
                      : "2px solid transparent",
                  }}
                  aria-label={`Commande ${cmd.label}`}
                >
                  <span
                    className="font-mono text-[11px] text-jarvis-cyan/85 tabular-nums shrink-0"
                    style={{ minWidth: "60px" }}
                  >
                    /{cmd.id}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-display text-[12px] text-jarvis-text leading-tight">
                      {cmd.label}
                    </span>
                    {cmd.description && (
                      <span className="block font-body text-[10px] text-jarvis-muted/80 leading-tight mt-0.5 truncate">
                        {cmd.description}
                      </span>
                    )}
                  </span>
                  {cmd.shortcut && (
                    <span className="font-mono text-[9px] text-jarvis-muted/60 shrink-0">
                      {cmd.shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
