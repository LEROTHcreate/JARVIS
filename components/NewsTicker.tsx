"use client";

import { useEffect, useState } from "react";

interface Headline {
  title: string;
  source: string;
}

/**
 * NewsTicker — bandeau qui défile en bas de l'écran avec les derniers titres
 * d'actualité. Source : flux RSS public Le Monde via le proxy `/api/news`.
 * Si la requête échoue, on retombe sur une liste de fausses headlines stylées
 * pour ne pas casser l'esthétique.
 */
const FALLBACK: Headline[] = [
  { title: "Activation du protocole JARVIS sur ce terminal", source: "STARK_OPS" },
  { title: "Réacteur arc — synchronisation stable à 99.7%", source: "ARC_CORE" },
  { title: "Lien neural établi. Tous systèmes nominaux.", source: "NEURAL_NET" },
  { title: "Cartographie locale actualisée via OSM/Overpass", source: "GEO_LINK" },
  { title: "Couche conversationnelle Groq en service", source: "LLM_IFACE" },
];

export function NewsTicker() {
  const [items, setItems] = useState<Headline[]>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/news");
        if (!res.ok) throw new Error("status");
        const data = await res.json();
        if (cancelled || !Array.isArray(data?.headlines)) return;
        if (data.headlines.length > 0) setItems(data.headlines.slice(0, 12));
      } catch {
        // Silencieux : on garde le fallback
      }
    };
    void load();
    const id = setInterval(load, 10 * 60 * 1000); // refresh toutes les 10 min
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // On duplique la liste pour un scroll infini sans coupure
  const doubled = [...items, ...items];

  return (
    <div className="hidden lg:flex pointer-events-none fixed top-0 left-0 right-0 z-[15] h-7 overflow-hidden border-b border-jarvis-cyan/10 bg-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 shrink-0 border-r border-jarvis-cyan/10">
        <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse" />
        <span className="font-display text-[9px] tracking-[0.4em] text-jarvis-cyan/80">
          LIVE FEED
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-y-0 flex items-center gap-10 whitespace-nowrap"
          style={{
            animation: "ticker-scroll 90s linear infinite",
          }}
        >
          {doubled.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-3 font-mono text-[10px] text-jarvis-text/85"
            >
              <span className="font-display text-[9px] tracking-[0.35em] text-jarvis-cyan/65">
                {h.source}
              </span>
              <span className="text-jarvis-cyan/40">›</span>
              <span className="tracking-wide">{h.title}</span>
              <span className="text-jarvis-cyan/30 ml-6">●</span>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
