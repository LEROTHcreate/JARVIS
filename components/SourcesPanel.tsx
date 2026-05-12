"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";

export type WebSource = {
  title: string;
  url: string;
  content: string;
};

interface Props {
  sources: WebSource[];
  query?: string;
}

/**
 * Panneau HUD à gauche de l'orbe listant les sources web sur lesquelles
 * JARVIS s'est appuyé pour répondre (résultats Tavily de l'outil
 * `web_search`). Chaque carte est cliquable et ouvre l'URL d'origine.
 * Masqué sur petits écrans (md+) pour ne pas voler de place au mobile.
 */
export function SourcesPanel({ sources, query }: Props) {
  return (
    <AnimatePresence>
      {sources.length > 0 && (
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="hidden md:flex absolute left-3 top-16 sm:top-20 z-20 flex-col gap-2 w-[300px] lg:w-[320px] max-h-[70vh] overflow-y-auto thin-scroll"
        >
          {/* Header — pill cyan style identique au reste du HUD */}
          <div className="glass-panel rounded-xl px-3 py-2 flex items-center gap-2 shrink-0">
            <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse" />
            <span className="font-display tracking-[0.3em] text-[10px] text-jarvis-cyan">
              SOURCES · {sources.length}
            </span>
            {query && (
              <span className="font-mono text-[10px] text-jarvis-muted truncate">
                &quot;{query}&quot;
              </span>
            )}
          </div>

          {/* Liste */}
          {sources.map((src, i) => {
            let domain = "";
            try {
              domain = new URL(src.url).hostname.replace(/^www\./, "");
            } catch {
              // URL malformée — on garde la string brute
              domain = src.url.slice(0, 40);
            }
            return (
              <a
                key={`${src.url}-${i}`}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-panel rounded-xl p-3 hover:bg-jarvis-cyan/10 hover:border-jarvis-cyan/40 transition group block"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-[10px] text-jarvis-cyan tabular-nums shrink-0">
                    [{String(i + 1).padStart(2, "0")}]
                  </span>
                  <span className="font-mono text-[9px] text-jarvis-muted truncate flex-1">
                    {domain}
                  </span>
                  <ExternalLink
                    size={10}
                    className="text-jarvis-muted group-hover:text-jarvis-cyan transition shrink-0"
                  />
                </div>
                <div className="font-body text-[13px] text-jarvis-text leading-snug mb-1.5 line-clamp-2">
                  {src.title}
                </div>
                {src.content && (
                  <div className="font-body text-[11px] text-jarvis-muted leading-snug line-clamp-3">
                    {src.content}
                  </div>
                )}
              </a>
            );
          })}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
