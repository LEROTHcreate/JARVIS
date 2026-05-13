"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";

export type WebSource = {
  title: string;
  url: string;
  content: string;
  /** URL d'image optionnelle (NASA APOD, drapeau pays, thumbnail Wikipedia...). */
  image?: string;
};

interface Props {
  sources: WebSource[];
}

/**
 * Panneau HUD à gauche de l'orbe listant les sources sur lesquelles
 * JARVIS s'est appuyé pour répondre (web_search Tavily, news_headlines,
 * hackernews_top, wikipedia_summary). Chaque carte est cliquable et ouvre
 * l'URL d'origine. Masqué sur petits écrans (md+).
 */
export function SourcesPanel({ sources }: Props) {
  return (
    <AnimatePresence>
      {sources.length > 0 && (
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="hidden md:flex flex-col gap-2 overflow-y-auto thin-scroll sources-panel-position"
        >
          {/* Liste — pas de header, les cartes ci-dessous portent déjà
              le domaine et le titre, redondant avec un bandeau "SOURCES · N". */}
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
                {/* Image en preview : NASA APOD photo, drapeau pays,
                    thumbnail Wikipedia... Contre-filtrée auto via .ultron-mode
                    img selector dans globals.css. */}
                {src.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src.image}
                    alt={src.title}
                    className="w-full max-h-[200px] object-cover rounded-lg mb-2 border border-jarvis-cyan/20"
                    loading="lazy"
                  />
                )}
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
