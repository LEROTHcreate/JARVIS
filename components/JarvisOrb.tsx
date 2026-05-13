"use client";

import { useRef, useState } from "react";
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
  /**
   * Compteur incrémenté à chaque "beat" détecté dans le mode `music`.
   * Le orb crée un nouvel anneau pulsé concentrique à chaque incrément.
   */
  beatCount?: number;
  /**
   * Slot pour rendre des effets (halos, transmissions, ripples) DANS
   * le wrapper du canvas 3D, pour que leur centre coïncide exactement
   * avec le centre du réacteur (pas le centre du wrapper externe plus
   * grand qui contient les anneaux SVG).
   */
  innerOverlay?: React.ReactNode;
  /** Mode Ultron : bascule la palette du réacteur 3D en rouge sang. */
  ultronMode?: boolean;
}

const labels: Record<JarvisState, string> = {
  idle: "EN ATTENTE",
  listening: "À L'ÉCOUTE",
  thinking: "RÉFLEXION...",
  speaking: "TRANSMISSION",
  music: "AMBIANCE",
};

// Easing doux pour le tracé
const REVEAL_EASE = [0.16, 1, 0.3, 1] as const;

export function JarvisOrb({
  state,
  audioLevel = 0,
  audioBands,
  beatCount = 0,
  innerOverlay,
  ultronMode = false,
}: Props) {
  const active = state !== "idle";
  const isListening = state === "listening";
  const isMusic = state === "music";
  // Plancher visible même sans son pour montrer que l'écoute est active
  const level = isListening ? Math.max(0.08, audioLevel) : 0;
  // Niveau musique avec plancher plus bas (la musique a souvent un plancher
  // d'énergie continu même entre les beats — on amplifie pour la viz).
  const musicLevel = isMusic ? Math.max(0.12, audioLevel) : 0;

  // Easter egg : clic sur le cœur du réacteur → flash + console + bip
  const [eggFlash, setEggFlash] = useState(false);
  const eggCountRef = useRef(0);
  const onEgg = () => {
    eggCountRef.current += 1;
    setEggFlash(true);
    setTimeout(() => setEggFlash(false), 700);
    // Petit bip cyan via WebAudio (pas de fichier asset à charger)
    try {
      type WindowAudio = Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const w = window as unknown as WindowAudio;
      const Ctx = window.AudioContext || w.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
        setTimeout(() => ctx.close().catch(() => {}), 400);
      }
    } catch {
      /* silencieux */
    }
    // Console message stylisé
    const messages = [
      "%c⚡ Mr. Stark, all systems online.",
      "%c⚡ Welcome back, Mr. Stark.",
      "%c⚡ Power level : 100%. Ready when you are.",
      "%c⚡ The suit is yours, sir.",
      "%c⚡ I'll do my best, sir.",
    ];
    const msg = messages[eggCountRef.current % messages.length];
    console.log(
      msg,
      "color:#67e8f9;font-family:monospace;font-weight:bold;text-shadow:0 0 6px #00d4ff;",
    );
  };

  return (
    <div className="relative grid place-items-center h-[260px] w-[260px] min-[360px]:h-[300px] min-[360px]:w-[300px] sm:h-[420px] sm:w-[420px] md:h-[520px] md:w-[520px]">
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

      {/* === Mode `music` =====================================================
          Visuel volontairement DIFFÉRENT du mode `speaking` :
          - speaking = barres FFT fines radiales (transmission radio)
          - music    = visualisation rythmique multicouche style "enceinte
                       holographique" (palette cyan exclusive). Couches :
            1. EQ extérieur épais avec gradient blanc→cyan + capuchons lumineux
            2. EQ miroir intérieur (barres réfléchies, plus discrètes)
            3. Hexagone audio-réactif (sommets modulés par paires de bandes)
            4. 3 anneaux fréquentiels (low/mid/high) qui pulsent indépendamment
            5. Lignes orbitales rotatives (2 contra-rotatives)
            6. Halo extérieur respirant (level continu)
            7. Anneaux concentriques au beat
            8. Particules éjectées radiales au beat (8 directions)
            9. Strobe radial central au beat (flash blanc bref)
          ====================================================================== */}
      {isMusic && audioBands && (
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full pointer-events-none"
        >
          <defs>
            {/* Gradient des barres EQ : cyan vif → blanc pur en pointe */}
            <linearGradient id="musicBarGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.6" />
              <stop offset="60%" stopColor="#67e8f9" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#f0f9ff" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* COUCHE 1 — EQ extérieur épais (les barres bien visibles qui
              donnent le rythme principal, capuchons lumineux aux pointes). */}
          {audioBands.map((value, i) => {
            const angle =
              (i * (360 / audioBands.length) - 90) * (Math.PI / 180);
            const baseR = 144;
            const maxBarLen = 32;
            const len = baseR + Math.max(0.08, value) * maxBarLen;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const tipX = 200 + len * cos;
            const tipY = 200 + len * sin;
            return (
              <g key={`mfft-out${i}`}>
                <line
                  x1={200 + baseR * cos}
                  y1={200 + baseR * sin}
                  x2={tipX}
                  y2={tipY}
                  stroke="url(#musicBarGrad)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  opacity={0.6 + value * 0.4}
                  style={{
                    filter: `drop-shadow(0 0 ${6 + value * 16}px #00d4ff)`,
                  }}
                />
                {/* Capuchon lumineux à la pointe */}
                <circle
                  cx={tipX}
                  cy={tipY}
                  r={2.5 + value * 3}
                  fill="#f0f9ff"
                  opacity={0.5 + value * 0.5}
                  style={{
                    filter: `drop-shadow(0 0 ${4 + value * 8}px #67e8f9)`,
                  }}
                />
              </g>
            );
          })}

          {/* COUCHE 2 — EQ miroir intérieur : chaque barre se prolonge vers
              l'intérieur, plus courte et plus discrète, donnant un effet
              de symétrie autour du baseR. */}
          {audioBands.map((value, i) => {
            const angle =
              (i * (360 / audioBands.length) - 90) * (Math.PI / 180);
            const baseR = 142;
            const innerLen = Math.max(0.05, value) * 18;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <line
                key={`mfft-in${i}`}
                x1={200 + baseR * cos}
                y1={200 + baseR * sin}
                x2={200 + (baseR - innerLen) * cos}
                y2={200 + (baseR - innerLen) * sin}
                stroke="#67e8f9"
                strokeWidth="4"
                strokeLinecap="round"
                opacity={0.25 + value * 0.4}
              />
            );
          })}

          {/* COUCHE 3 — Hexagone audio-réactif : 6 sommets, chacun modulé
              par la moyenne de 2 bandes adjacentes (12 / 6 = 2). Donne
              une forme géométrique qui ondule au rythme du spectre. */}
          {(() => {
            const points: string[] = [];
            for (let v = 0; v < 6; v++) {
              const bandAvg =
                ((audioBands[v * 2] ?? 0) + (audioBands[v * 2 + 1] ?? 0)) / 2;
              const angle = (v * 60 - 90) * (Math.PI / 180);
              const r = 110 + bandAvg * 18;
              points.push(`${200 + r * Math.cos(angle)},${200 + r * Math.sin(angle)}`);
            }
            return (
              <polygon
                points={points.join(" ")}
                fill="none"
                stroke="rgba(103,232,249,0.55)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                style={{
                  filter: `drop-shadow(0 0 ${4 + musicLevel * 10}px rgba(0,212,255,0.8))`,
                }}
              />
            );
          })()}

          {/* COUCHE 4 — Anneaux fréquentiels low/mid/high : 3 cercles
              concentriques fins, chacun consomme une plage de bandes. */}
          {(() => {
            const lowAvg =
              audioBands.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
            const midAvg =
              audioBands.slice(4, 8).reduce((s, v) => s + v, 0) / 4;
            const highAvg =
              audioBands.slice(8, 12).reduce((s, v) => s + v, 0) / 4;
            return (
              <>
                <circle
                  cx="200"
                  cy="200"
                  r={92 + lowAvg * 6}
                  fill="none"
                  stroke="#00d4ff"
                  strokeWidth="2.5"
                  opacity={0.25 + lowAvg * 0.55}
                  style={{
                    filter: `drop-shadow(0 0 ${4 + lowAvg * 12}px #00d4ff)`,
                  }}
                />
                <circle
                  cx="200"
                  cy="200"
                  r={122 + midAvg * 5}
                  fill="none"
                  stroke="#67e8f9"
                  strokeWidth="1.5"
                  opacity={0.25 + midAvg * 0.55}
                  style={{
                    filter: `drop-shadow(0 0 ${3 + midAvg * 8}px #67e8f9)`,
                  }}
                />
                <circle
                  cx="200"
                  cy="200"
                  r={186 + highAvg * 4}
                  fill="none"
                  stroke="#f0f9ff"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  opacity={0.2 + highAvg * 0.55}
                />
              </>
            );
          })()}

          {/* COUCHE 5 — Lignes orbitales rotatives (2 contra-rotatives,
              opacité modulée par le niveau global). Donne une sensation
              de spin musical en plus des anneaux statiques. */}
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 200px" }}
          >
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="120"
              stroke="#67e8f9"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.3 + musicLevel * 0.6}
              style={{
                filter: `drop-shadow(0 0 4px #00d4ff)`,
              }}
            />
            <circle
              cx="200"
              cy="80"
              r="2"
              fill="#f0f9ff"
              opacity={0.6 + musicLevel * 0.4}
            />
          </motion.g>
          <motion.g
            animate={{ rotate: -360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 200px" }}
          >
            <line
              x1="200"
              y1="320"
              x2="200"
              y2="280"
              stroke="#00d4ff"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.3 + musicLevel * 0.6}
              style={{
                filter: `drop-shadow(0 0 4px #67e8f9)`,
              }}
            />
            <circle
              cx="200"
              cy="320"
              r="2"
              fill="#f0f9ff"
              opacity={0.6 + musicLevel * 0.4}
            />
          </motion.g>
        </svg>
      )}

      {/* COUCHE 6 — Halo extérieur respirant (level continu, intégré entre
          les beats pour ne jamais avoir de visuel mort). */}
      {isMusic && (
        <motion.div
          className="absolute pointer-events-none rounded-full h-[80%] w-[80%]"
          animate={{
            scale: 1 + musicLevel * 0.06,
            opacity: 0.4 + musicLevel * 0.5,
          }}
          transition={{ duration: 0.1, ease: "linear" }}
          style={{
            border: "1px solid rgba(103,232,249,0.55)",
            boxShadow: `0 0 ${30 + musicLevel * 80}px rgba(0,212,255,${0.35 + musicLevel * 0.45}), inset 0 0 ${20 + musicLevel * 60}px rgba(103,232,249,${0.15 + musicLevel * 0.4})`,
          }}
        />
      )}

      {/* COUCHE 7 — Anneaux concentriques au BEAT (3 max, cycle 1.1s) */}
      {isMusic && (
        <div className="absolute inset-0 pointer-events-none">
          {[0, 1, 2].map((slot) => {
            const ringId = beatCount - slot;
            if (ringId <= 0) return null;
            return (
              <motion.div
                key={`beat-${ringId}`}
                initial={{ opacity: 0.7, scale: 0.35 }}
                animate={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
                className="absolute inset-0 rounded-full"
                style={{
                  border: "2px solid rgba(103,232,249,0.85)",
                  boxShadow:
                    "0 0 24px rgba(0,212,255,0.6), inset 0 0 18px rgba(103,232,249,0.35)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* COUCHE 8 — Particules éjectées au beat : 8 traînées radiales qui
          partent du centre à chaque beat. Garde 2 vagues max (16 particules)
          pour ne pas saturer le DOM. Angle légèrement randomisé par beatId
          pour casser la régularité. */}
      {isMusic && (
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full pointer-events-none overflow-visible"
        >
          {[0, 1].map((slot) => {
            const beatId = beatCount - slot;
            if (beatId <= 0) return null;
            // Décalage angulaire pseudo-aléatoire dérivé du beatId (pas
            // besoin de Math.random qui casserait la cohérence du render).
            const phaseOffset = (beatId * 37) % 360;
            return (
              <g key={`particles-${beatId}`}>
                {Array.from({ length: 8 }).map((_, p) => {
                  const angle =
                    ((p * 45 + phaseOffset) - 90) * (Math.PI / 180);
                  const cos = Math.cos(angle);
                  const sin = Math.sin(angle);
                  const startR = 80;
                  const endR = 220;
                  return (
                    <motion.circle
                      key={`p${beatId}-${p}`}
                      cx={200 + startR * cos}
                      cy={200 + startR * sin}
                      r="2.5"
                      fill="#67e8f9"
                      initial={{ opacity: 0.95 }}
                      animate={{
                        opacity: 0,
                        cx: 200 + endR * cos,
                        cy: 200 + endR * sin,
                      }}
                      transition={{ duration: 0.85, ease: "easeOut" }}
                      style={{
                        filter: "drop-shadow(0 0 5px #00d4ff)",
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      {/* COUCHE 9 — Strobe radial central au beat : flash bref blanc/cyan
          en gradient depuis le centre. Rend chaque beat percussif et net
          (vs les anneaux qui fadent doucement). 1 seul slot suffit — un
          beat efface le précédent grâce à la `key`. */}
      {isMusic && beatCount > 0 && (
        <motion.div
          key={`strobe-${beatCount}`}
          initial={{ opacity: 0.55, scale: 0.5 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            background:
              "radial-gradient(circle at center, rgba(240,249,255,0.85) 0%, rgba(103,232,249,0.4) 30%, transparent 60%)",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Scan rotatif pendant `thinking` — deux arcs contra-rotatifs +
          tête lumineuse, signal très visible que JARVIS calcule. */}
      {state === "thinking" && (
        <svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full pointer-events-none"
        >
          <defs>
            <linearGradient id="scanArcGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
              <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f0f9ff" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="scanArcGrad2" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {/* Grand arc qui tourne sur l'anneau extérieur (1.4s) */}
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 200px" }}
          >
            <path
              d="M 200 5 A 195 195 0 0 1 366 86"
              fill="none"
              stroke="url(#scanArcGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 10px #67e8f9)" }}
            />
            <circle
              cx="366"
              cy="86"
              r="4"
              fill="#f0f9ff"
              style={{ filter: "drop-shadow(0 0 8px #67e8f9)" }}
            />
          </motion.g>
          {/* Arc plus petit qui tourne en SENS INVERSE (1.0s) */}
          <motion.g
            animate={{ rotate: -360 }}
            transition={{ duration: 1.0, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 200px" }}
          >
            <path
              d="M 200 60 A 140 140 0 0 1 320 140"
              fill="none"
              stroke="url(#scanArcGrad2)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.85"
              style={{ filter: "drop-shadow(0 0 6px #67e8f9)" }}
            />
          </motion.g>
        </svg>
      )}


      {/* Réacteur Arc — orbe central. Le canvas est dans son wrapper d'origine
          (taille inchangée). Pour éviter la coupure carrée nette des particules,
          un mask-image radial est appliqué sur le canvas → fade alpha vers les
          bords au lieu d'un clip net. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={
          state === "thinking"
            ? { opacity: 1, scale: [1, 1.12, 1] }
            : isListening
              ? { opacity: 1, scale: 1 + level * 0.14 }
              : isMusic
                ? { opacity: 1, scale: 1 + musicLevel * 0.18 }
                : { opacity: 1, scale: 1 }
        }
        transition={
          state === "thinking"
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : isListening || isMusic
              ? { duration: 0.08, ease: "linear" }
              : { duration: 0.7, ease: REVEAL_EASE }
        }
        className="relative z-10 grid place-items-center h-[60%] w-[60%]"
        style={{
          // Quand JARVIS parle, on utilise audioLevel (signal TTS pulsé)
          // pour intensifier le glow → la lumière bleue "respire" à
          // chaque syllabe, comme dans les films Iron Man.
          // En mode music, on pousse le glow encore plus loin (basses).
          filter: (() => {
            const speakLvl =
              state === "speaking" ? audioLevel : isMusic ? musicLevel : level;
            const intensity = isMusic ? 1.4 : 1.0;
            return `drop-shadow(0 0 ${24 + speakLvl * 80 * intensity}px rgba(0,212,255,${0.55 + speakLvl * 0.4})) drop-shadow(0 0 ${50 + speakLvl * 120 * intensity}px rgba(103,232,249,${0.3 + speakLvl * 0.5}))`;
          })(),
        }}
      >
        {/* Canvas 3D — masque radial pour fade soft des bords (pas de coupure
            carrée nette). Taille du canvas inchangée (inset-0). */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            maskImage:
              "radial-gradient(circle at center, black 55%, transparent 95%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, black 55%, transparent 95%)",
          }}
        >
          <ArcReactor3D
            state={state}
            audioLevel={audioLevel}
            ultronMode={ultronMode}
          />
        </div>

        {/* Overlay slot — halos / transmissions / ripples passées par le
            parent via la prop `innerOverlay`. Rendus dans CE motion.div
            (h-[60%] w-[60%]) pour que leur `left-1/2 top-1/2` soit pile
            sur le centre du canvas 3D. */}
        {innerOverlay && (
          <div className="absolute inset-0 pointer-events-none">
            {innerOverlay}
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

      {/* Easter egg : flash blanc qui se dilate au clic du cœur */}
      <AnimatePresence>
        {eggFlash && (
          <motion.div
            initial={{ opacity: 0.7, scale: 0.3 }}
            animate={{ opacity: 0, scale: 2.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, rgba(240,249,255,0.55) 0%, rgba(0,212,255,0.25) 35%, transparent 70%)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Zone cliquable invisible centrée sur le cœur du réacteur (~12% de
          l'orbe). Active l'easter egg sans bloquer les autres interactions. */}
      <button
        type="button"
        onClick={onEgg}
        aria-label="Réacteur Arc"
        className="absolute z-30 rounded-full"
        style={{
          width: "12%",
          height: "12%",
          left: "44%",
          top: "44%",
          background: "transparent",
          border: "none",
        }}
      />
    </div>
  );
}
