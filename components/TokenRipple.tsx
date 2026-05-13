"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/types";

interface Props {
  messages: ChatMessage[];
}

/**
 * Pendant que JARVIS streame sa réponse, déclenche de petites ondes
 * concentriques qui partent du cœur du réacteur toutes les ~140 ms si
 * de nouveaux tokens arrivent. Donne un sentiment de "données qui
 * pulsent" en sortie pendant la génération.
 *
 * Throttle : on n'émet une nouvelle onde que si :
 *   - le contenu du dernier message assistant a grandi
 *   - ET au moins MIN_INTERVAL_MS se sont écoulées depuis la dernière
 */
export function TokenRipple({ messages }: Props) {
  const lastLenRef = useRef(0);
  const lastEmitAtRef = useRef(0);
  const [ripples, setRipples] = useState<number[]>([]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      lastLenRef.current = 0;
      return;
    }
    const len = last.content.length;
    const grew = len > lastLenRef.current;
    lastLenRef.current = len;
    if (!grew) return;

    const MIN_INTERVAL_MS = 140;
    const now = performance.now();
    if (now - lastEmitAtRef.current < MIN_INTERVAL_MS) return;
    lastEmitAtRef.current = now;

    const id = now;
    setRipples((r) => (r.length > 5 ? [...r.slice(-5), id] : [...r, id]));
    // Auto-cleanup après l'animation
    const cleanup = setTimeout(() => {
      setRipples((r) => r.filter((x) => x !== id));
    }, 900);
    return () => clearTimeout(cleanup);
  }, [messages]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[23] overflow-hidden">
      {ripples.map((id) => (
        <motion.div
          key={id}
          initial={{ scale: 0.15, opacity: 0.55 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.85, ease: "easeOut" }}
          className="absolute left-1/2 top-1/2 h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-jarvis-cyan/60"
          style={{
            boxShadow:
              "0 0 12px rgba(0,212,255,0.4), inset 0 0 8px rgba(103,232,249,0.25)",
          }}
        />
      ))}
    </div>
  );
}
