"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage } from "@/types";

interface Props {
  messages: ChatMessage[];
}

interface Trail {
  id: number;
  direction: "out" | "in";
}

/**
 * Trace lumineuse qui relie le centre de la viewport (= position de l'orbe)
 * au coin haut-droit du panneau de chat. Animée :
 *  - direction="out"  : un éclat part de l'orbe vers le chat (réponse JARVIS)
 *  - direction="in"   : un éclat part du chat vers l'orbe (envoi user)
 *
 * Visible uniquement sur lg+ (là où le chat est en colonne droite).
 *
 * On utilise un SVG plein écran avec une courbe simple (quadratique).
 */
export function MessageTrail({ messages }: Props) {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [counters, setCounters] = useState({ user: 0, assistant: 0 });

  useEffect(() => {
    const user = messages.filter((m) => m.role === "user").length;
    // Compte des messages assistant TERMINÉS (id ≠ "pending")
    const assistant = messages.filter(
      (m) => m.role === "assistant" && m.id !== "pending" && m.content,
    ).length;

    const newTrails: Trail[] = [];
    if (user > counters.user) {
      newTrails.push({ id: performance.now(), direction: "in" });
    }
    if (assistant > counters.assistant) {
      newTrails.push({ id: performance.now() + 1, direction: "out" });
    }
    if (newTrails.length) {
      setTrails((prev) => [...prev.slice(-3), ...newTrails]);
      const ids = newTrails.map((t) => t.id);
      setTimeout(() => {
        setTrails((prev) => prev.filter((t) => !ids.includes(t.id)));
      }, 900);
    }
    setCounters({ user, assistant });
  }, [messages, counters.user, counters.assistant]);

  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[28] hidden lg:block"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="trail-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
          <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <AnimatePresence>
        {trails.map((t) => (
          <TrailPath key={t.id} direction={t.direction} />
        ))}
      </AnimatePresence>
    </svg>
  );
}

function TrailPath({ direction }: { direction: "out" | "in" }) {
  // Coordonnées en % du viewport : on cible visuellement le centre de
  // l'orbe (50% / 50%) et le coin haut-gauche du chat panel (≈ 67% / 30%).
  const orbeX = "50%";
  const orbeY = "50%";
  const chatX = "67%";
  const chatY = "30%";
  // Point de contrôle pour la courbe (légèrement au-dessus)
  const ctrlX = "58%";
  const ctrlY = "18%";

  const d =
    direction === "in"
      ? `M ${chatX} ${chatY} Q ${ctrlX} ${ctrlY} ${orbeX} ${orbeY}`
      : `M ${orbeX} ${orbeY} Q ${ctrlX} ${ctrlY} ${chatX} ${chatY}`;

  return (
    <motion.path
      d={d}
      fill="none"
      stroke="url(#trail-grad)"
      strokeWidth="1.5"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0.9 }}
      animate={{ pathLength: 1, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      style={{ filter: "drop-shadow(0 0 4px #67e8f9)" }}
    />
  );
}
