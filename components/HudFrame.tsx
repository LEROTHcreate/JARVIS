"use client";

import { useEffect, useState } from "react";

export function HudFrame() {
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
      {/* Top left — crochet + identifiant système */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 hologram-flicker">
        <div className="relative h-8 w-8">
          <span className="absolute inset-y-0 left-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 top-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute top-1 left-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
        <div className="ml-2 mt-1 font-mono text-[9px] text-jarvis-cyan/70 tracking-widest">
          SYS://0xJARVIS
        </div>
      </div>

      {/* Top right — crochet + horloge millisecondes */}
      <div className="pointer-events-none absolute top-3 right-3 z-20 hologram-flicker text-right">
        <div className="relative h-8 w-8 ml-auto">
          <span className="absolute inset-y-0 right-0 w-px bg-jarvis-cyan/80" />
          <span className="absolute inset-x-0 top-0 h-px bg-jarvis-cyan/80" />
          <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-jarvis-cyan shadow-[0_0_6px_#00d4ff]" />
        </div>
        <div className="mr-2 mt-1 font-mono text-[9px] text-jarvis-cyan/70 tracking-widest tabular-nums">
          T+{hex}
        </div>
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
