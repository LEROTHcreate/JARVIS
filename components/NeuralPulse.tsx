"use client";

import { useEffect, useRef } from "react";
import type { JarvisState } from "@/types";

interface Props {
  state?: JarvisState;
  audioLevel?: number;
}

/**
 * NeuralPulse — bordure verticale DROITE : une ligne d'activité "neurale"
 * façon ECG qui oscille en continu sur l'axe vertical (le temps descend,
 * l'oscillation est horizontale). Plus rapide / amplifiée quand JARVIS
 * est en thinking ou speaking, calme en idle. Réagit aussi au niveau audio
 * en listening.
 *
 * Canvas vertical : on dessine l'historique du signal en remontant, le
 * sample le plus récent en bas, les plus anciens en haut.
 */
export function NeuralPulse({ state = "idle", audioLevel = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const samplesRef = useRef<number[]>([]);
  const stateRef = useRef<JarvisState>(state);
  const levelRef = useRef<number>(audioLevel);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    window.addEventListener("resize", setSize);

    const SAMPLE_COUNT = 120;
    samplesRef.current = Array(SAMPLE_COUNT).fill(0);

    let t = 0;
    let lastFrame = 0;
    const TARGET_MS = 33; // ~30fps

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastFrame < TARGET_MS) return;
      lastFrame = now;
      t += 0.06;

      const s = stateRef.current;
      const lvl = levelRef.current;

      let amplitude = 0.18;
      let freqMul = 1;
      if (s === "listening") {
        amplitude = 0.18 + lvl * 0.55;
        freqMul = 1.5;
      } else if (s === "thinking") {
        amplitude = 0.55;
        freqMul = 2.6;
      } else if (s === "speaking") {
        amplitude = 0.45 + lvl * 0.3;
        freqMul = 2.2;
      }

      const sample =
        Math.sin(t * freqMul) * 0.6 * amplitude +
        Math.sin(t * freqMul * 2.7) * 0.25 * amplitude +
        (Math.random() - 0.5) * 0.08 * amplitude;
      samplesRef.current.push(sample);
      if (samplesRef.current.length > SAMPLE_COUNT) {
        samplesRef.current.shift();
      }

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      // Ligne centrale verticale très discrète (axe du signal)
      ctx.strokeStyle = "rgba(0,212,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      // Tracé du pulse vertical : Y = position dans le temps (bas = récent),
      //                          X = amplitude oscillante autour du centre
      ctx.strokeStyle = "rgba(103,232,249,0.85)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(0,212,255,0.8)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const samples = samplesRef.current;
      for (let i = 0; i < samples.length; i++) {
        const y = (i / (samples.length - 1)) * h;
        const x = w / 2 + samples[i] * (w / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", setSize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="hidden lg:block pointer-events-none fixed right-0 top-1/2 -translate-y-1/2 z-[14] hologram-flicker"
      style={{
        width: "60px",
        height: "260px",
      }}
    >
      {/* Label en bas, écrit verticalement pour rester cohérent */}
      <div
        className="absolute -left-3 top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-[0.4em] text-jarvis-cyan/55 whitespace-nowrap"
        style={{
          transform: "translateY(-50%) rotate(-90deg)",
          transformOrigin: "left center",
        }}
      >
        NEURAL · PULSE
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
