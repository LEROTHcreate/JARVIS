"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatMessage } from "@/types";

interface Props {
  messages: ChatMessage[];
}

/**
 * Effet déclenché quand l'utilisateur ENVOIE un message (réciproque
 * d'IncomingTransmission). Affiche :
 * - 2 ondes qui s'écartent en s'éteignant (depuis le cœur vers l'extérieur)
 * - Un label `▸ TRANSMITTING ◂` qui flash brièvement
 *
 * Durée ~0.8s, plus court que l'incoming.
 */
export function OutgoingTransmission({ messages }: Props) {
  const [pulse, setPulse] = useState(0);
  const [prevUserCount, setPrevUserCount] = useState(0);

  useEffect(() => {
    const userCount = messages.filter((m) => m.role === "user").length;
    if (userCount > prevUserCount) {
      setPulse((p) => p + 1);
    }
    setPrevUserCount(userCount);
  }, [messages, prevUserCount]);

  return (
    <AnimatePresence>
      {pulse > 0 && (
        <motion.div
          key={pulse}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={(def) => {
            if (
              typeof def === "object" &&
              (def as { opacity?: number }).opacity === 0
            ) {
              setPulse(0);
            }
          }}
          className="pointer-events-none absolute inset-0 z-[24] overflow-hidden"
        >
          {/* 2 ondes plus subtiles (transmission montante) */}
          {[0, 0.12].map((delay, i) => (
            <motion.div
              key={`out-wave-${pulse}-${i}`}
              initial={{ scale: 0.3, opacity: 0.65 }}
              animate={{ scale: 3.6, opacity: 0 }}
              transition={{ duration: 0.85, delay, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-jarvis-white/70"
              style={{
                boxShadow:
                  "0 0 18px rgba(240,249,255,0.55), inset 0 0 12px rgba(103,232,249,0.3)",
              }}
            />
          ))}

          {/* Texte TRANSMITTING qui flash en bas centre */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 1, 1, 0], y: 0 }}
            transition={{ duration: 0.75, times: [0, 0.2, 0.7, 1] }}
            className="absolute left-1/2 -bottom-2 -translate-x-1/2 font-display tracking-[0.45em] text-[10px] sm:text-[11px] text-jarvis-white glow-text-soft whitespace-nowrap"
          >
            ▸ TRANSMITTING ◂
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
