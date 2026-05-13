"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { filterCommands, type JarvisCommand } from "@/lib/commands";

interface Props {
  commands: JarvisCommand[];
}

/**
 * Command palette globale style ⌘K. Ouverte par Ctrl+K / Cmd+K (n'importe
 * où sur la page), fermée par Esc ou clic extérieur. Recherche fuzzy +
 * navigation flèches + Enter pour exécuter.
 */
export function CommandPalette({ commands }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hotkey global Ctrl+K / Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setSelected(0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Trigger via CustomEvent — utilisé par les boutons mobile (pas de
  // raccourci clavier sur téléphone). Tout composant peut faire :
  //   window.dispatchEvent(new CustomEvent("jarvis-open-palette"))
  useEffect(() => {
    const onOpenEvent = () => {
      setOpen(true);
      setQuery("");
      setSelected(0);
    };
    window.addEventListener("jarvis-open-palette", onOpenEvent);
    return () =>
      window.removeEventListener("jarvis-open-palette", onOpenEvent);
  }, []);

  // Auto-focus le champ de recherche à l'ouverture
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // Reset sélection quand la liste change
  useEffect(() => {
    setSelected(0);
  }, [query]);

  const exec = (cmd: JarvisCommand) => {
    setOpen(false);
    setQuery("");
    void cmd.action();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] grid place-items-start pt-[18vh] px-4 bg-jarvis-bg/55 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const cmd = filtered[selected];
              if (cmd) exec(cmd);
            }
          }}
        >
          <motion.div
            initial={{ y: -12, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[560px] rounded-2xl overflow-hidden glass-panel border border-jarvis-cyan/30"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow:
                "0 24px 80px -16px rgba(0,212,255,0.45), 0 0 40px -8px rgba(0,212,255,0.25)",
            }}
          >
            {/* Header search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-jarvis-cyan/15">
              <Search size={14} className="text-jarvis-cyan/80 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une commande…"
                className="flex-1 bg-transparent outline-none font-body text-[14px] text-jarvis-text placeholder:text-jarvis-muted/60"
                aria-label="Rechercher une commande"
              />
              <kbd className="font-mono text-[9px] tracking-widest text-jarvis-muted/70 px-1.5 py-0.5 rounded border border-jarvis-cyan/15">
                ESC
              </kbd>
              <button
                onClick={() => setOpen(false)}
                className="text-jarvis-muted/70 hover:text-jarvis-cyan transition"
                aria-label="Fermer la palette"
              >
                <X size={14} />
              </button>
            </div>

            {/* Liste */}
            <div className="max-h-[55vh] overflow-y-auto thin-scroll py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center font-mono text-[10px] text-jarvis-muted/70 tracking-widest">
                  AUCUNE COMMANDE TROUVÉE
                </div>
              ) : (
                filtered.map((cmd, i) => {
                  const active = i === selected;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setSelected(i)}
                      onClick={() => exec(cmd)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition"
                      style={{
                        background: active
                          ? "rgba(0, 212, 255, 0.12)"
                          : "transparent",
                        borderLeft: active
                          ? "2px solid rgba(0,212,255,0.85)"
                          : "2px solid transparent",
                      }}
                    >
                      <span
                        className="font-mono text-[11px] text-jarvis-cyan/85 tabular-nums shrink-0"
                        style={{ minWidth: "70px" }}
                      >
                        /{cmd.id}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-display text-[13px] text-jarvis-text leading-tight">
                          {cmd.label}
                        </span>
                        {cmd.description && (
                          <span className="block font-body text-[11px] text-jarvis-muted/80 leading-tight mt-0.5 truncate">
                            {cmd.description}
                          </span>
                        )}
                      </span>
                      {cmd.shortcut && (
                        <kbd className="font-mono text-[9px] tracking-widest text-jarvis-muted/70 px-1.5 py-0.5 rounded border border-jarvis-cyan/15 shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-jarvis-cyan/15 font-mono text-[9px] tracking-widest text-jarvis-muted/60">
              <span>↑↓ NAVIGUER · ↵ EXÉCUTER</span>
              <span>⌘K POUR FERMER</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
