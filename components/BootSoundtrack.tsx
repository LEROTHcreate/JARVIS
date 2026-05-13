"use client";

import { useEffect, useRef } from "react";

const FFT_BAND_COUNT = 12;
const ZERO_BANDS: number[] = Array(FFT_BAND_COUNT).fill(0);

interface Props {
  /** Booléen qui devient `true` quand l'utilisateur a interagi (geste
   * obligatoire pour l'autoplay audio sur Chrome/Safari). */
  enabled: boolean;
  /** True pendant la séquence de boot. Quand passe à false, la musique
   * fade out doucement et se stoppe. */
  playing: boolean;
  /** Chemin du fichier audio dans /public. Défaut : /audio/boot-theme.mp3 */
  src?: string;
  /** Volume max (0..1). Défaut 0.5 — l'instru doit rester discrète sous
   * la voix Cartesia du greeting. */
  maxVolume?: number;
  /** Durée du fade out en ms à la fin du boot. Défaut 1200. */
  fadeOutMs?: number;
  /** True quand l'audio joue effectivement (utile pour activer le visuel
   * music du réacteur uniquement quand il y a vraiment du son). */
  onPlayingChange?: (playing: boolean) => void;
  /** Niveau RMS [0..1] du signal audio, émis à 60fps tant que la musique
   * joue. Permet au réacteur de pulser au rythme du boot soundtrack. */
  onAudioLevel?: (level: number) => void;
  /** 12 bandes FFT [0..1] du spectre, émises à 60fps. */
  onAudioBands?: (bands: number[]) => void;
  /** Appelé à chaque "beat" détecté (pic d'énergie au-dessus de la
   * moyenne glissante). Permet d'animer des anneaux concentriques. */
  onBeat?: () => void;
}

/**
 * BootSoundtrack — joue une instrumentale d'ambiance pendant la séquence
 * de boot JARVIS. Démarre dès que l'utilisateur a interagi (sinon
 * autoplay bloqué) et fade out à la fin du boot.
 *
 * En option, expose une analyse audio (level / bandes FFT / beats) pour
 * faire réagir le réacteur central à la musique. L'analyse est branchée
 * via `createMediaElementSource(audio)` — on reconnecte sur
 * `ctx.destination` pour ne PAS couper la sortie native (sinon le son
 * disparaîtrait dans l'AudioContext).
 *
 * Pour activer : place un MP3 dans `/public/audio/boot-theme.mp3` (par ex.
 * l'instrumentale "Should I Go?" / Iron Man 2 OST).
 */
export function BootSoundtrack({
  enabled,
  playing,
  src = "/audio/boot-theme.mp3",
  maxVolume = 0.5,
  fadeOutMs = 1200,
  onPlayingChange,
  onAudioLevel,
  onAudioBands,
  onBeat,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);

  // ─── AnalyserNode pour la viz audio-réactive du réacteur ─────────────────
  // On garde un seul AudioContext pour toute la durée de vie du composant
  // (createMediaElementSource ne peut être appelé qu'UNE fois sur un même
  // HTMLAudioElement, sinon throw InvalidStateError).
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRafRef = useRef<number | null>(null);
  const rmsHistRef = useRef<number[]>([]);
  const lastBeatRef = useRef(0);
  const isAnalyzingRef = useRef(false);

  // Stoppe la boucle d'analyse + reset les valeurs côté parent. NE
  // disconnecte PAS la source audio — sinon le son sortirait plus du tout
  // tant qu'on n'a pas reconnecté ctx.destination.
  const stopTick = () => {
    if (tickRafRef.current !== null) {
      cancelAnimationFrame(tickRafRef.current);
      tickRafRef.current = null;
    }
    if (isAnalyzingRef.current) {
      isAnalyzingRef.current = false;
      onPlayingChange?.(false);
      onAudioLevel?.(0);
      onAudioBands?.(ZERO_BANDS);
    }
    rmsHistRef.current = [];
    lastBeatRef.current = 0;
  };

  // Démarre la boucle d'analyse — créé l'AudioContext / source / analyser
  // à la première invocation seulement, puis ne fait que relancer le tick
  // aux invocations suivantes.
  const startTick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (tickRafRef.current !== null) return; // déjà en cours
    // Aucun callback fourni → pas la peine de créer un AudioContext +
    // un AnalyserNode + de bruler du CPU à 60fps pour rien.
    if (!onAudioLevel && !onAudioBands && !onBeat && !onPlayingChange) {
      return;
    }

    try {
      type WindowAudio = Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const w = window as unknown as WindowAudio;
      const Ctx = window.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;

      // Premier branchement : crée le ctx + source + analyser et reconnecte
      // sur destination (impératif sinon plus de son audible).
      if (!ctxRef.current) {
        const ctx = new Ctx();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
      }

      // L'AudioContext peut être en état "suspended" si pas de geste
      // utilisateur — on tente un resume silencieux (échec accepté).
      if (ctxRef.current.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }

      const analyser = analyserRef.current;
      if (!analyser) return;
      const timeBuf = new Uint8Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      // On garde le spectre quasi-complet (jusqu'à ~12 kHz à 48 kHz SR) —
      // les aigus portent les hi-hats et brillances.
      const usefulBins = Math.floor(analyser.frequencyBinCount * 0.5);
      const binsPerBand = Math.floor(usefulBins / FFT_BAND_COUNT);

      isAnalyzingRef.current = true;
      onPlayingChange?.(true);

      const tick = () => {
        // Si l'audio est en pause OU son volume est tombé à 0 (fade out
        // terminé), on arrête le tick — pas la peine de bruler du CPU
        // pour visualiser du silence.
        if (audio.paused || audio.volume <= 0.001) {
          stopTick();
          return;
        }

        analyser.getByteTimeDomainData(timeBuf);
        let sum = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = (timeBuf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / timeBuf.length);
        // Le boost compense le faible volume initial (maxVolume ~0.5).
        const level = Math.min(1, rms * 3.5);
        onAudioLevel?.(level);

        // Détection de beat : moyenne glissante sur ~60 frames (~1s).
        // Si l'instant courant > 1.4× moyenne ET cooldown 200ms écoulé.
        const hist = rmsHistRef.current;
        hist.push(rms);
        if (hist.length > 60) hist.shift();
        if (hist.length >= 20) {
          const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
          const now = performance.now();
          if (
            rms > avg * 1.4 &&
            rms > 0.03 &&
            now - lastBeatRef.current > 200
          ) {
            lastBeatRef.current = now;
            onBeat?.();
          }
        }

        analyser.getByteFrequencyData(freqBuf);
        const bands: number[] = new Array(FFT_BAND_COUNT);
        for (let b = 0; b < FFT_BAND_COUNT; b++) {
          let max = 0;
          const start = b * binsPerBand;
          const end = start + binsPerBand;
          for (let j = start; j < end; j++) {
            if (freqBuf[j] > max) max = freqBuf[j];
          }
          bands[b] = Math.pow(max / 255, 0.7);
        }
        onAudioBands?.(bands);

        tickRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      // createMediaElementSource peut échouer si l'audio est déjà attaché
      // à un autre context (réutilisation). On log et on continue sans viz.
      console.warn("[BootSoundtrack] analyser setup failed:", e);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.loop = false;
    audio.volume = 0;
    // Si l'audio finit naturellement (pas en boucle), on coupe aussi le tick.
    audio.addEventListener("ended", stopTick);
    audio.addEventListener("pause", () => {
      // Note : `pause` est aussi émis pendant un seek — mais on ne seek
      // jamais ce fichier, donc pause = vraie fin de lecture pour nous.
      stopTick();
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeEventListener("ended", stopTick);
      audio.src = "";
      audioRef.current = null;
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
      stopTick();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
      }
      ctxRef.current = null;
      analyserRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // 1) Tentative de démarrage immédiat au mount, sans attendre l'interaction.
  //    Beaucoup de navigateurs autorisent l'autoplay sur les sites avec un
  //    historique d'engagement (MEI Chrome, etc.). Si rejeté, on attend
  //    l'interaction (cf. effet suivant).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    audio.volume = maxVolume;
    audio
      .play()
      .then(() => startTick())
      .catch(() => {
        /* autoplay bloqué : on retentera quand enabled passera à true */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // 2) Si l'autoplay était bloqué au mount, on retente dès que l'utilisateur
  //    a fait son premier geste (enabled = true). On évite de re-jouer si
  //    l'audio est déjà en cours.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || !playing) return;
    if (audio.paused) {
      audio.volume = maxVolume;
      audio
        .play()
        .then(() => startTick())
        .catch(() => {
          /* abandon : peut arriver si l'utilisateur a déjà mute le tab */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, playing, maxVolume]);

  // Fade out quand playing passe à false
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || playing) return;

    const start = performance.now();
    const initial = audio.volume;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / fadeOutMs);
      audio.volume = Math.max(0, initial * (1 - t));
      if (t < 1) {
        fadeRafRef.current = requestAnimationFrame(tick);
      } else {
        audio.pause();
        audio.currentTime = 0;
        fadeRafRef.current = null;
        // `pause` event handler appellera stopTick() automatiquement.
      }
    };
    fadeRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
    };
  }, [playing, fadeOutMs]);

  return null;
}
