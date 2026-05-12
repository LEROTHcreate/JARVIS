"use client";

import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { JarvisState } from "@/types";

// Réacteur 3D Three.js — chargé côté client uniquement (WebGL)
const ArcReactor3D = dynamic(
  () => import("./ArcReactor3D").then((m) => m.ArcReactor3D),
  { ssr: false },
);

interface Props {
  state: JarvisState;
  audioLevel?: number;
  audioBands?: number[];
}

const labels: Record<JarvisState, string> = {
  idle: "EN ATTENTE",
  listening: "À L'ÉCOUTE",
  thinking: "RÉFLEXION...",
  speaking: "TRANSMISSION",
};

// Easing doux pour le tracé
const REVEAL_EASE = [0.16, 1, 0.3, 1] as const;

export function JarvisOrb({ state, audioLevel = 0, audioBands }: Props) {
  const active = state !== "idle";
  const isListening = state === "listening";
  // Plancher visible même sans son pour montrer que l'écoute est active
  const level = isListening ? Math.max(0.08, audioLevel) : 0;

  return (
    <div className="relative grid place-items-center h-[300px] w-[300px] sm:h-[420px] sm:w-[420px] md:h-[520px] md:w-[520px]">
      {/* Aura de fond */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.0, ease: REVEAL_EASE }}
        className="absolute inset-0 rounded-full aura-cyan animate-aura-drift pointer-events-none"
      />

      {/* Anneau extérieur tournant */}
      <svg
        viewBox="0 0 400 400"
        className={cn(
          "absolute inset-0 h-full w-full pointer-events-none",
          active ? "animate-spin-slow" : "animate-spin-slow opacity-60",
        )}
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.9" />
            <stop offset="30%" stopColor="#00d4ff" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0a84ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="ringGrad2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
            <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Cercle pointillé : pathLength casse le dasharray → fade-in à la place */}
        <motion.circle
          cx="200"
          cy="200"
          r="195"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="1"
          strokeDasharray="2 6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.9, ease: "easeOut" }}
        />
        {/* Cercle continu : tracé via pathLength */}
        <motion.circle
          cx="200"
          cy="200"
          r="178"
          fill="none"
          stroke="rgba(0,212,255,0.18)"
          strokeWidth="1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: REVEAL_EASE }}
        />
        <motion.circle
          cx="200"
          cy="200"
          r="170"
          fill="none"
          stroke="url(#ringGrad2)"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.7, ease: REVEAL_EASE }}
        />
        {/* Marqueurs cardinaux */}
        {[0, 90, 180, 270].map((deg, i) => (
          <motion.g
            key={deg}
            transform={`rotate(${deg} 200 200)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 1.1 + i * 0.06 }}
          >
            <line
              x1="200"
              y1="2"
              x2="200"
              y2="18"
              stroke="#00d4ff"
              strokeWidth="2"
              style={{ filter: "drop-shadow(0 0 4px #00d4ff)" }}
            />
            <circle cx="200" cy="2" r="2" fill="#f0f9ff" />
          </motion.g>
        ))}
        {/* Petits marqueurs intermédiaires */}
        {Array.from({ length: 24 }).map((_, i) => {
          const deg = i * 15;
          if (deg % 90 === 0) return null;
          return (
            <motion.g
              key={`m${i}`}
              transform={`rotate(${deg} 200 200)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: 1.3 + i * 0.018 }}
            >
              <line
                x1="200"
                y1="6"
                x2="200"
                y2="12"
                stroke="rgba(0,212,255,0.6)"
                strokeWidth="1"
              />
            </motion.g>
          );
        })}
      </svg>

      {/* Anneau intermédiaire avec graduations */}
      <svg
        viewBox="0 0 400 400"
        className="absolute h-[78%] w-[78%] pointer-events-none animate-spin-reverse opacity-90"
      >
        {/* Cercle pointillé : fade-in */}
        <motion.circle
          cx="200"
          cy="200"
          r="170"
          fill="none"
          stroke="rgba(103,232,249,0.35)"
          strokeWidth="1"
          strokeDasharray="60 12 6 12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
        />
        {/* Tirets de graduation : cascade angulaire */}
        {Array.from({ length: 36 }).map((_, i) => {
          const deg = i * 10;
          return (
            <motion.g
              key={`g${i}`}
              transform={`rotate(${deg} 200 200)`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: 0.5 + i * 0.015 }}
            >
              <line
                x1="200"
                y1="30"
                x2="200"
                y2={i % 3 === 0 ? 40 : 36}
                stroke={
                  i % 3 === 0
                    ? "rgba(0,212,255,0.7)"
                    : "rgba(0,212,255,0.3)"
                }
                strokeWidth="1"
              />
            </motion.g>
          );
        })}
      </svg>

      {/* Anneau audio-réactif (visible uniquement en listening) */}
      {isListening && (
        <motion.div
          className="absolute grid place-items-center pointer-events-none h-[55%] w-[55%]"
          animate={{
            scale: 1 + level * 0.22,
            opacity: 0.5 + level * 0.5,
          }}
          transition={{ duration: 0.08, ease: "linear" }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              border: "1px solid rgba(103,232,249,0.7)",
              boxShadow: `0 0 ${24 + level * 90}px rgba(0,212,255,${0.4 + level * 0.5}), inset 0 0 ${18 + level * 50}px rgba(103,232,249,${0.25 + level * 0.45})`,
            }}
          />
        </motion.div>
      )}

      {/* Spectre FFT en cercle — visible en `listening`. 12 bandes de
          fréquence du micro réparties sur 360°, longueur proportionnelle
          à l'énergie de chaque bande. Donne un effet "égaliseur radial"
          plus vivant que la simple pulsation RMS. */}
      {isListening && audioBands && (
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full pointer-events-none"
        >
          {audioBands.map((value, i) => {
            const angle =
              (i * (360 / audioBands.length) - 90) * (Math.PI / 180);
            const baseR = 110;
            const maxBarLen = 38;
            const len = baseR + Math.max(0.05, value) * maxBarLen;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <line
                key={`fft${i}`}
                x1={200 + baseR * cos}
                y1={200 + baseR * sin}
                x2={200 + len * cos}
                y2={200 + len * sin}
                stroke="#67e8f9"
                strokeWidth="3"
                strokeLinecap="round"
                opacity={0.45 + value * 0.55}
                style={{
                  filter: `drop-shadow(0 0 ${4 + value * 10}px #00d4ff)`,
                }}
              />
            );
          })}
        </svg>
      )}

      {/* Particules de transmission — visibles pendant `speaking`,
          voyagent de l'anneau extérieur vers le cœur (réception de données). */}
      {state === "speaking" && (
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full pointer-events-none"
        >
          {Array.from({ length: 14 }).map((_, i) => {
            const angle = (i * (360 / 14) * Math.PI) / 180;
            const rOut = 195;
            const rIn = 48;
            const rMid = (rOut + rIn) / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <motion.circle
                key={`tx${i}`}
                r="2"
                fill="#67e8f9"
                cx={200 + rOut * cos}
                cy={200 + rOut * sin}
                initial={{ opacity: 0 }}
                animate={{
                  cx: [
                    200 + rOut * cos,
                    200 + rMid * cos,
                    200 + rIn * cos,
                  ],
                  cy: [
                    200 + rOut * sin,
                    200 + rMid * sin,
                    200 + rIn * sin,
                  ],
                  opacity: [0, 1, 0],
                  r: [2.5, 2, 0.5],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeIn",
                }}
                style={{ filter: "drop-shadow(0 0 5px #67e8f9)" }}
              />
            );
          })}
        </svg>
      )}

      {/* Réacteur Arc — orbe central */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={
          state === "thinking"
            ? { opacity: 1, scale: [1, 1.06, 1] }
            : isListening
              ? { opacity: 1, scale: 1 + level * 0.14 }
              : { opacity: 1, scale: 1 }
        }
        transition={
          state === "thinking"
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : isListening
              ? { duration: 0.08, ease: "linear" }
              : { duration: 0.7, ease: REVEAL_EASE }
        }
        className="relative z-10 grid place-items-center h-[60%] w-[60%]"
        style={{
          filter: `drop-shadow(0 0 ${24 + level * 60}px rgba(0,212,255,${0.55 + level * 0.4})) drop-shadow(0 0 ${50 + level * 80}px rgba(103,232,249,${0.3 + level * 0.4}))`,
        }}
      >
        {/* Réacteur en vraie 3D (Three.js + R3F) */}
        <div className="absolute inset-0 pointer-events-none">
          <ArcReactor3D state={state} audioLevel={audioLevel} />
        </div>

        {/* Onde sonore quand il parle — superposée au cœur */}
        {state === "speaking" && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="flex items-center gap-[2px]">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <motion.span
                  key={i}
                  initial={{ height: 4 }}
                  animate={{ height: [4, 22, 10, 28, 8, 18, 4] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.08,
                    ease: "easeInOut",
                  }}
                  className="w-[2px] rounded-full bg-jarvis-white"
                  style={{
                    boxShadow:
                      "0 0 6px rgba(240,249,255,0.95), 0 0 12px rgba(0,212,255,0.9)",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Status label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.7 }}
        className="absolute -bottom-10 sm:-bottom-12 left-1/2 -translate-x-1/2"
      >
        <span className="font-display font-semibold tracking-[0.55em] text-[10px] sm:text-[11px] text-jarvis-cyan glow-text-soft">
          {labels[state]}
        </span>
      </motion.div>
    </div>
  );
}
