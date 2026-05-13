"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { renderSafeMarkdown } from "@/lib/safeMarkdown";
import type { ChatMessage } from "@/types";

interface Props {
  message: ChatMessage;
  /** Si true, l'IA est en mode Ultron → label "ULTRON" au lieu de "JARVIS" */
  ultronMode?: boolean;
}

// Phrases qui défilent dans le skeleton "JARVIS pense" — change toutes les
// 1.4s pour donner l'impression que le système travaille vraiment.
const THINKING_PHRASES = [
  "ANALYSE EN COURS",
  "TRAITEMENT NEURAL",
  "SYNTHÈSE",
  "RECHERCHE CONTEXTUELLE",
  "INFÉRENCE",
  "FORMULATION",
];

function ThinkingSkeleton() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length),
      1400,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-mono text-[11px] tracking-[0.3em] text-jarvis-cyan/85 space-y-2">
      {/* Phrase qui change */}
      <div className="flex items-center gap-2">
        <motion.span
          key={phraseIdx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {THINKING_PHRASES[phraseIdx]}
        </motion.span>
        <motion.span
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="text-jarvis-cyan"
        >
          ▍
        </motion.span>
      </div>
      {/* 3 barres skeleton qui pulsent en cascade */}
      <div className="flex flex-col gap-1.5">
        {[100, 80, 55].map((widthPct, i) => (
          <motion.div
            key={i}
            className="h-[6px] rounded-full"
            style={{
              width: `${widthPct}%`,
              background:
                "linear-gradient(90deg, rgba(0,212,255,0.05) 0%, rgba(0,212,255,0.4) 50%, rgba(0,212,255,0.05) 100%)",
              backgroundSize: "200% 100%",
            }}
            animate={{ backgroundPositionX: ["200%", "-200%"] }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: "linear",
              delay: i * 0.18,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Bulle de message du chat — sans bulle visible, juste préfixe coloré +
 * contenu HTML safe (markdown sanitizé). Mémoisée car ChatInterface re-rend
 * à chaque keystroke ; on évite de re-parser le markdown des 25 anciens
 * messages.
 */
function MessageImpl({ message: m, ultronMode = false }: Props) {
  const isUser = m.role === "user";
  // Cas spécial : message JARVIS "pending" sans contenu encore = JARVIS pense
  const isPending = !isUser && m.id === "pending" && !m.content;
  // Parse markdown UNE FOIS par contenu (pas à chaque parent re-render)
  const html = useMemo(
    () => (m.content ? renderSafeMarkdown(m.content) : ""),
    [m.content],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        isUser ? "ml-auto max-w-[55%]" : "mr-auto max-w-[88%]",
      )}
    >
      {/* Préfixe : barre verticale + label YOU/JARVIS */}
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="h-3 w-[2px]"
          style={{
            background: isUser
              ? "rgba(0,212,255,0.95)"
              : "rgba(240,249,255,0.55)",
            boxShadow: isUser ? "0 0 6px rgba(0,212,255,0.6)" : undefined,
          }}
        />
        <span
          className="font-display font-semibold text-[9px] tracking-[0.45em] uppercase"
          style={{
            color: isUser
              ? "rgba(103,232,249,0.95)"
              : "rgba(0,212,255,0.95)",
          }}
        >
          {isUser ? "YOU" : ultronMode ? "ULTRON" : "JARVIS"}
        </span>
      </div>

      {/* Image jointe (user uniquement) */}
      {isUser && m.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.image}
          alt="Image jointe"
          className="mb-2 max-h-64 w-auto rounded-lg border border-jarvis-cyan/25 ml-3"
        />
      )}

      {/* Skeleton "JARVIS pense" — pas encore de tokens reçus */}
      {isPending && (
        <div className="pl-3">
          <ThinkingSkeleton />
        </div>
      )}

      {/* Contenu HTML safe, indenté sous la barre verticale */}
      {html && (
        <div
          className="font-display whitespace-pre-wrap break-words pl-3 text-[13.5px] leading-relaxed tracking-[0.01em]"
          style={{
            color: isUser
              ? "rgba(0,212,255,0.92)"
              : "rgba(230,241,255,0.92)",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </motion.div>
  );
}

// Comparateur shallow : ne re-render que si l'id, le contenu ou l'image
// changent. Le streaming d'un message en cours grandit son `content` →
// re-render OK ; les messages déjà finalisés ne re-render plus.
export const Message = memo(MessageImpl, (a, b) => {
  return (
    a.message.id === b.message.id &&
    a.message.content === b.message.content &&
    a.message.image === b.message.image &&
    a.message.role === b.message.role &&
    a.ultronMode === b.ultronMode
  );
});
