"use client";

import { useEffect, useState } from "react";

export function HudFrame({ ultronMode = false }: { ultronMode?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 80);
    return () => clearInterval(id);
  }, []);

  // Petits chiffres roulants pour donner une impression de télémétrie live
  const hex = tick.toString(16).padStart(3, "0").toUpperCase();
  const cpu = (40 + (tick % 30)).toString().padStart(2, "0");
  const mem = (62 + (tick % 7)).toString().padStart(2, "0");

  return (
    <>
      {/* Top left — crochet d'angle. Décalé à top-8 pour passer SOUS le
          ticker LIVE FEED qui occupe les ~24 premiers pixels. Le SYS://0x…
          est séparé et descendu plus bas pour laisser la place à la pile
          verticale skull + label JARVIS dessous. */}
      <div className="pointer-events-none absolute top-8 left-3 z-20 hologram-flicker">
        <div className="relative h-8 w-8">
          <span className="absolute inset-y-0 left-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 top-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute top-1 left-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
      </div>

      {/* SYS://0xJARVIS — déplacé sous la pile crochet/skull/JARVIS. */}
      <div className="pointer-events-none absolute top-[132px] left-5 z-20 hologram-flicker font-mono text-[9px] text-jarvis-cyan/70 tracking-widest">
        SYS://{ultronMode ? "0xULTRON" : "0xJARVIS"}
      </div>

      {/* Top right — crochet d'angle (sans le label T+xxx pour éviter
          de chevaucher les blocs météo / SolarCycle qui occupent ce coin).
          Décalé à top-8 pour passer SOUS le ticker LIVE FEED, comme le
          crochet haut-gauche. */}
      <div className="pointer-events-none absolute top-8 right-3 z-20 hologram-flicker text-right">
        <div className="relative h-8 w-8 ml-auto">
          <span className="absolute inset-y-0 right-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 top-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
      </div>

      {/* Compteur T+xxx — déplacé en bas-droite, juste au-dessus du label
          ONLINE qui occupe déjà ce coin. */}
      <div className="pointer-events-none absolute bottom-16 right-5 z-20 hologram-flicker text-right font-mono text-[9px] text-jarvis-cyan/70 tracking-widest tabular-nums">
        T+{hex}
      </div>

      {/* Bottom left — crochet + diagnostics */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 hologram-flicker">
        <div className="mb-1 ml-2 font-mono text-[9px] text-jarvis-cyan/70 tracking-widest tabular-nums">
          CPU {cpu}% · MEM {mem}%
        </div>
        <div className="relative h-8 w-8">
          <span className="absolute inset-y-0 left-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 bottom-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute bottom-1 left-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
      </div>

      {/* Bottom right — crochet + statut */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 hologram-flicker text-right">
        <div className="mb-1 mr-2 font-mono text-[9px] text-jarvis-cyan/70 tracking-widest">
          ONLINE
        </div>
        <div className="relative h-8 w-8 ml-auto">
          <span className="absolute inset-y-0 right-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 bottom-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
      </div>
    </>
  );
}
