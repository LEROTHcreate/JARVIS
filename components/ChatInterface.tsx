"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Send,
  Map,
  Volume2,
  VolumeX,
  MessageSquare,
  X,
  Paperclip,
  Image as ImageIcon,
  Radio,
  Square,
  Music,
  MoreHorizontal,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWakeWord } from "@/lib/useWakeWord";
import { Message } from "@/components/Message";
import { SlashMenu } from "@/components/SlashMenu";
import { isSlashQuery, filterCommands, type JarvisCommand } from "@/lib/commands";
import type { ChatMessage, JarvisState } from "@/types";

interface Props {
  messages: ChatMessage[];
  state: JarvisState;
  onSend: (text: string, image?: string) => void;
  onToggleMap: () => void;
  mapOpen: boolean;
  onRecordingChange?: (recording: boolean) => void;
  onAudioLevel?: (level: number) => void;
  onAudioBands?: (bands: number[]) => void;
  onStop?: () => void;
  onTtsPlayingChange?: (playing: boolean) => void;
  onWakeWordDetect?: () => void;
  /** Callbacks pour le TtsDock (HUD bas-gauche, dock à droite du PerfDock) */
  onTtsStatusChange?: (
    status: "ok" | "pending" | "error" | "idle",
  ) => void;
  onTtsProviderChange?: (
    provider: "cartesia" | "elevenlabs" | "elevenlabs-ultron" | null,
  ) => void;
  onTtsLatency?: (ms: number) => void;
  onTtsCharsConsumed?: (chars: number) => void;
  /** Commandes disponibles via le slash menu (taper `/`) */
  slashCommands?: JarvisCommand[];
  /** Si true, force le TTS en mode Ultron (voix ULTRON_VOICE_ID côté serveur). */
  ultronMode?: boolean;
  /** Notifie le parent de l'activation du mode musique ambiante (pour orbState). */
  onMusicModeChange?: (active: boolean) => void;
  /** Compteur de beats détectés en mode musique (incrémenté à chaque pic). */
  onBeat?: () => void;
  /** True quand la piste de boot joue : dans ce cas on alimente le visuel
   * music depuis l'audio interne du BootSoundtrack (déjà branché côté
   * page.tsx) plutôt que d'ouvrir le micro qui ne capte que faiblement
   * les HP. Auto-switch sur le mic dès que le boot soundtrack s'arrête. */
  bootMusicActive?: boolean;
}

// Nombre de bandes de fréquence affichées en cercle autour du réacteur.
// Doit matcher ce que JarvisOrb attend (12 actuellement).
const FFT_BAND_COUNT = 12;
const ZERO_BANDS: number[] = Array(FFT_BAND_COUNT).fill(0);

// Limite défensive sur la taille de l'image jointe (data URL).
// 5 MB de fichier brut ≈ ~6.7 MB en base64 — Groq plafonne autour de cet ordre.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Type-safe webkit SpeechRecognition shim
type AnySpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export function ChatInterface({
  messages,
  state,
  onSend,
  onToggleMap,
  mapOpen,
  onRecordingChange,
  onAudioLevel,
  onAudioBands,
  onStop,
  onTtsPlayingChange,
  onWakeWordDetect,
  onTtsStatusChange,
  onTtsProviderChange,
  onTtsLatency,
  onTtsCharsConsumed,
  slashCommands = [],
  ultronMode = false,
  onMusicModeChange,
  onBeat,
  bootMusicActive = false,
}: Props) {
  const [input, setInput] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  // Slash menu visible si l'input commence par "/" sans espace après
  const slashOpen = isSlashQuery(input);
  const slashFiltered = slashOpen
    ? filterCommands(slashCommands, input).slice(0, 8)
    : [];
  const [recording, setRecording] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  // Menu "⋯" mobile (regroupe wake word, music, command palette pour
  // libérer de la place sur les petits écrans). Caché sur sm+ où tous
  // les boutons s'affichent individuellement.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const recogRef = useRef<AnySpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const lastSpokenRef = useRef<string>("");
  const lastAutoOpenedIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsCtxRef = useRef<AudioContext | null>(null);
  const ttsRafRef = useRef<number | null>(null);
  const ttsPlayingRef = useRef(false);

  // Mode musique ambiante : analyseur audio dédié, indépendant du push-to-talk.
  // FFT plus large (2048) + smoothing plus court → mieux pour la musique
  // (attaque des kicks, séparation basse/medium/aigu) que pour la voix.
  const [musicMode, setMusicMode] = useState(false);
  const musicCtxRef = useRef<AudioContext | null>(null);
  const musicStreamRef = useRef<MediaStream | null>(null);
  const musicRafRef = useRef<number | null>(null);
  // Historique RMS glissant pour détection de beat (window ~1s à 60fps)
  const musicRmsHistRef = useRef<number[]>([]);
  const musicLastBeatRef = useRef(0);

  // Remonte l'état d'enregistrement au parent
  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  // Ferme le menu overflow ⋯ au clic en dehors. Le `pointerdown` est
  // préféré à `click` pour fermer AVANT qu'un autre tap n'enregistre.
  useEffect(() => {
    if (!overflowOpen) return;
    const onDown = (e: PointerEvent) => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [overflowOpen]);

  // Sur lg+ (l'input est `sr-only` mais focusable), on force le focus sur
  // l'input à tout keydown imprimable hors zones de saisie. Comme ça l'user
  // peut taper n'importe où sur la page sans se soucier du focus.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (window.innerWidth < 1024) return;
      const ae = document.activeElement;
      if (
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        (ae as HTMLElement | null)?.isContentEditable
      ) {
        return; // on est déjà dans un champ → laisser le natif gérer
      }
      // Ignore les modificateurs seuls et raccourcis avec Ctrl/Meta
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore les touches non-imprimables sauf Backspace/Enter
      const isPrintable = e.key.length === 1;
      if (!isPrintable && e.key !== "Backspace" && e.key !== "Enter") return;
      mainInputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Premier focus au montage (sur lg+) — autoFocus React n'est pas toujours
  // fiable selon le moment du rendu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024) {
      const id = setTimeout(() => mainInputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, []);

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      stopAudioMonitor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAudioMonitor = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    onAudioLevel?.(0);
    onAudioBands?.(ZERO_BANDS);
  };

  const startAudioMonitor = async () => {
    if (typeof window === "undefined") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const Ctx =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const timeBuf = new Uint8Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      // Pour la voix humaine, l'énergie utile est sous ~4kHz. À 48kHz de
      // sample rate, ça représente la première moitié des bins. On ignore
      // donc la partie haute (peu d'info, ne fait que tirer la moyenne).
      const usefulBins = Math.floor(analyser.frequencyBinCount * 0.5);
      const binsPerBand = Math.floor(usefulBins / FFT_BAND_COUNT);

      const tick = () => {
        // RMS pour le niveau global (alimente l'orbe + plancher d'écoute)
        analyser.getByteTimeDomainData(timeBuf);
        let sum = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = (timeBuf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / timeBuf.length);
        const level = Math.min(1, rms * 4);
        onAudioLevel?.(level);

        // Spectre FFT downsamplé en N bandes (max par groupe pour garder
        // les pics audibles plutôt qu'une moyenne plate).
        analyser.getByteFrequencyData(freqBuf);
        const bands: number[] = new Array(FFT_BAND_COUNT);
        for (let b = 0; b < FFT_BAND_COUNT; b++) {
          let max = 0;
          const start = b * binsPerBand;
          const end = start + binsPerBand;
          for (let j = start; j < end; j++) {
            if (freqBuf[j] > max) max = freqBuf[j];
          }
          // Normalise + courbe légèrement compressive pour réveiller les
          // bandes faibles sans saturer les fortes.
          bands[b] = Math.pow(max / 255, 0.75);
        }
        onAudioBands?.(bands);

        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Permission refusée ou pas de micro : on continue sans monitoring
    }
  };

  // ─── Mode musique ambiante ────────────────────────────────────────────────
  // Stoppe le stream musique et libère toutes les ressources audio.
  const stopMusicMonitor = () => {
    if (musicRafRef.current !== null) {
      cancelAnimationFrame(musicRafRef.current);
      musicRafRef.current = null;
    }
    musicStreamRef.current?.getTracks().forEach((t) => t.stop());
    musicStreamRef.current = null;
    if (musicCtxRef.current && musicCtxRef.current.state !== "closed") {
      musicCtxRef.current.close().catch(() => {});
    }
    musicCtxRef.current = null;
    musicRmsHistRef.current = [];
    musicLastBeatRef.current = 0;
    onAudioLevel?.(0);
    onAudioBands?.(ZERO_BANDS);
  };

  // Démarre le stream musique : capture micro, FFT optimisé musique (large
  // fftSize, smoothing court), tick 60fps qui émet level + bandes au parent
  // ET qui détecte les "beats" via une moyenne glissante (pic > 1.4× moyenne
  // récente, cooldown 200 ms entre 2 beats pour éviter le spam).
  const startMusicMonitor = async () => {
    if (typeof window === "undefined") return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Désactive les filtres prévus pour la voix — la musique doit
          // arriver brute sinon les basses sont écrasées par l'AGC.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      musicStreamRef.current = stream;
      const Ctx =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      musicCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      const timeBuf = new Uint8Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      // Pour la musique : on garde le spectre quasi-complet (jusqu'à ~12 kHz
      // pour 48 kHz de SR) — les aigus portent l'info des hi-hats.
      const usefulBins = Math.floor(analyser.frequencyBinCount * 0.5);
      const binsPerBand = Math.floor(usefulBins / FFT_BAND_COUNT);

      const tick = () => {
        analyser.getByteTimeDomainData(timeBuf);
        let sum = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = (timeBuf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / timeBuf.length);
        const level = Math.min(1, rms * 3.5);
        onAudioLevel?.(level);

        // Détection de beat : moyenne glissante sur ~60 frames (~1s).
        // Si l'instant courant > 1.4× moyenne ET cooldown écoulé → beat.
        const hist = musicRmsHistRef.current;
        hist.push(rms);
        if (hist.length > 60) hist.shift();
        if (hist.length >= 20) {
          const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
          const now = performance.now();
          if (
            rms > avg * 1.4 &&
            rms > 0.04 && // seuil absolu : ignore le silence
            now - musicLastBeatRef.current > 200
          ) {
            musicLastBeatRef.current = now;
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

        musicRafRef.current = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch {
      // Permission refusée : retour false → on annule le toggle côté UI
      return false;
    }
  };

  // Toggle propre : si actif → stop ; si inactif → demande perm + start.
  // Refuse si recording en cours (le SpeechRecognition tient le micro).
  // Si le boot soundtrack joue, on n'ouvre PAS le micro — l'audio interne
  // alimente déjà la viz (cf. <BootSoundtrack> dans page.tsx). Le mic
  // démarrera automatiquement dès que la piste s'arrêtera (effet plus bas).
  const toggleMusicMode = async () => {
    if (recording) {
      alert(
        "Coupe d'abord l'enregistrement micro pour activer le mode musique.",
      );
      return;
    }
    if (musicMode) {
      stopMusicMonitor();
      setMusicMode(false);
      onMusicModeChange?.(false);
      return;
    }
    // Boot soundtrack actif → pas besoin du micro, le visuel se nourrit
    // déjà de l'analyse audio interne du <BootSoundtrack>.
    if (bootMusicActive) {
      setMusicMode(true);
      onMusicModeChange?.(true);
      return;
    }
    const ok = await startMusicMonitor();
    if (!ok) {
      alert(
        "Impossible d'accéder au micro. Vérifie les permissions du navigateur.",
      );
      return;
    }
    setMusicMode(true);
    onMusicModeChange?.(true);
  };

  // Auto-switch entre source boot ↔ source micro quand l'état du boot
  // change pendant que le mode music est actif :
  //   - boot s'arrête → on ouvre le micro pour ne pas laisser le visuel figé
  //   - boot redémarre alors qu'on a le mic → on ferme le mic (sinon double
  //     écriture sur audioLevel/audioBands à 60fps depuis 2 sources).
  useEffect(() => {
    if (!musicMode) return;
    if (bootMusicActive) {
      if (musicCtxRef.current) stopMusicMonitor();
    } else {
      if (!musicCtxRef.current) {
        void startMusicMonitor();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootMusicActive, musicMode]);

  // Si l'utilisateur démarre une reco vocale alors que le mode musique
  // tourne, on coupe automatiquement la musique (un seul stream micro à la
  // fois). On ne reprend pas auto à la fin — il faudra recliquer.
  useEffect(() => {
    if (recording && musicMode) {
      stopMusicMonitor();
      setMusicMode(false);
      onMusicModeChange?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // Cleanup à l'unmount
  useEffect(() => {
    return () => {
      stopMusicMonitor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto scroll (desktop floating + mobile modal)
  useEffect(() => {
    for (const ref of [scrollRef, mobileScrollRef]) {
      ref.current?.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Ouvre automatiquement le chat plein écran sur mobile à chaque
  // nouvelle réponse de JARVIS, sans rouvrir pendant le streaming.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 640px)").matches) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    if (lastAutoOpenedIdRef.current === last.id) return;
    lastAutoOpenedIdRef.current = last.id;
    setMobileChatOpen(true);
  }, [messages]);

  // Coupe immédiatement la TTS en cours + libère les ressources (audio,
  // AudioContext analyzer, raf, object URL) et notifie le parent.
  const stopTTS = () => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (ttsRafRef.current !== null) {
      cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = null;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.removeAttribute("src");
      ttsAudioRef.current.load();
      // Retire l'élément du DOM s'il y est attaché
      if (ttsAudioRef.current.parentNode) {
        ttsAudioRef.current.parentNode.removeChild(ttsAudioRef.current);
      }
      ttsAudioRef.current = null;
    }
    if (ttsCtxRef.current && ttsCtxRef.current.state !== "closed") {
      ttsCtxRef.current.close().catch(() => {});
    }
    ttsCtxRef.current = null;
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    // Coupe aussi le fallback Web Speech API (Cartesia + ElevenLabs ko →
    // tryBrowserTTSFallback). Sans ça, le bouton 🔇 ne stoppe pas la voix
    // navigateur en cours de lecture.
    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.cancel();
    }
    if (ttsPlayingRef.current) {
      ttsPlayingRef.current = false;
      onTtsPlayingChange?.(false);
      onAudioLevel?.(0);
      onAudioBands?.(ZERO_BANDS);
    }
  };

  // Fallback TTS via l'API native du navigateur (Web Speech API). Utilisé
  // quand Cartesia échoue (quota dépassé, 500, etc.). Voix française du
  // navigateur, gratuite — moins belle mais fonctionnelle.
  const tryBrowserTTSFallback = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      console.warn("[TTS fallback] speechSynthesis non disponible");
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "fr-FR";
      utter.rate = 1.05;
      utter.pitch = 0.95;
      utter.volume = 1.0;
      // Préférer une voix française disponible
      const voices = window.speechSynthesis.getVoices();
      const french =
        voices.find((v) => v.lang === "fr-FR") ||
        voices.find((v) => v.lang.startsWith("fr"));
      if (french) utter.voice = french;
      utter.onstart = () => {
        console.log("[TTS fallback] lecture Web Speech API démarrée");
        ttsPlayingRef.current = true;
        onTtsPlayingChange?.(true);
      };
      utter.onend = () => {
        console.log("[TTS fallback] lecture terminée");
        ttsPlayingRef.current = false;
        onTtsPlayingChange?.(false);
      };
      utter.onerror = (e) => {
        console.warn("[TTS fallback] erreur :", e);
        ttsPlayingRef.current = false;
        onTtsPlayingChange?.(false);
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error("[TTS fallback] échec :", e);
    }
  };

  // Synthèse vocale du dernier message via Cartesia (/api/tts).
  useEffect(() => {
    if (!voiceOutput) {
      stopTTS();
      // Marque la dernière réponse comme "déjà lue" pour qu'une réactivation
      // future de la voix ne la rejoue pas (sinon clic 🔇 puis 🔊 → JARVIS
      // recommence à parler de la dernière réponse, comportement parasite).
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant" && last.content) {
        lastSpokenRef.current = last.content;
      }
      return;
    }
    if (state !== "idle") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    if (last.content === lastSpokenRef.current) return;

    lastSpokenRef.current = last.content;
    // Nettoyage léger du markdown pour ne pas le faire prononcer.
    const text = last.content.replace(/[*_`#>]/g, "").trim();
    if (!text) return;

    stopTTS();
    const ctrl = new AbortController();
    ttsAbortRef.current = ctrl;

    (async () => {
      try {
        console.log(
          "[TTS] fetch /api/tts pour :",
          text.slice(0, 60) + (text.length > 60 ? "…" : ""),
        );
        onTtsStatusChange?.("pending");
        const tStart = performance.now();
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            ...(ultronMode ? { ultron: true } : {}),
          }),
          signal: ctrl.signal,
        });
        onTtsLatency?.(performance.now() - tStart);
        const provider = res.headers.get("x-tts-provider");
        if (provider === "cartesia" || provider === "elevenlabs" || provider === "elevenlabs-ultron") {
          onTtsProviderChange?.(provider);
        }
        if (!res.ok) {
          onTtsStatusChange?.("error");
          const errText = await res.text().catch(() => "");
          console.error(
            `[TTS] /api/tts a renvoyé ${res.status} :`,
            errText || "(corps vide)",
          );
          throw new Error(`TTS ${res.status}`);
        }
        const blob = await res.blob();
        if (ctrl.signal.aborted) return;
        if (blob.size === 0) {
          console.error("[TTS] Cartesia a renvoyé un blob vide");
          throw new Error("blob vide");
        }
        const url = URL.createObjectURL(blob);
        ttsObjectUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.volume = 1.0;
        audio.muted = false;
        // On attache l'audio au DOM — `new Audio()` détaché marche en théorie
        // mais certains builds Chrome/Windows refusent de router le son d'un
        // élément non monté. L'élément est invisible.
        audio.style.display = "none";
        document.body.appendChild(audio);
        ttsAudioRef.current = audio;

        // NOTE: on a essayé `createMediaElementSource` pour piloter l'orbe
        // depuis l'audio TTS, mais cette API tue la sortie native du
        // <audio> et route tout dans l'AudioContext — qui peut rester muet
        // si le browser n'a pas reçu un user-gesture valide. Tant que la
        // lecture directe ne marche pas chez tous les users, on garde
        // l'approche simple `audio.play()` ; les bandes FFT TTS sont
        // simulées par un fallback pulsé (voir tick ci-dessous).

        const tick = () => {
          // Visualisation simulée pendant la lecture TTS — combinaison de
          // plusieurs sinusoïdes à fréquences différentes pour un rythme
          // chaotique style "syllabique" (au lieu d'un sin uniforme), +
          // un facteur d'enveloppe (produit de sin) qui crée des pics
          // marqués ressemblant à des attaques de syllabes.
          const t = performance.now() / 1000;
          const carrier = Math.abs(Math.sin(t * 2.6));
          const envelope = Math.abs(
            Math.sin(t * 6.1) * Math.sin(t * 1.7 + 0.3),
          );
          const noise = Math.abs(Math.sin(t * 13.3 + Math.sin(t * 0.9)));
          const fakeLevel = Math.min(
            1,
            0.18 + carrier * 0.25 + envelope * 0.5 + noise * 0.12,
          );
          onAudioLevel?.(fakeLevel);
          const fakeBands = Array.from({ length: FFT_BAND_COUNT }, (_, i) =>
            Math.max(
              0.15,
              0.45 + 0.4 * Math.sin(t * (2 + i * 0.35) + i * 0.7),
            ),
          );
          onAudioBands?.(fakeBands);
          ttsRafRef.current = requestAnimationFrame(tick);
        };

        audio.onended = () => {
          if (ttsObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            ttsObjectUrlRef.current = null;
          }
          stopTTS();
        };

        try {
          await audio.play();
          console.log(
            "[TTS] audio.play() OK · state =",
            {
              volume: audio.volume,
              muted: audio.muted,
              paused: audio.paused,
              duration: audio.duration,
              readyState: audio.readyState,
              currentSrc: audio.currentSrc?.slice(0, 30) + "…",
            },
          );
          // 500ms après → est-ce que la lecture progresse vraiment ?
          setTimeout(() => {
            if (!ttsAudioRef.current) {
              console.warn(
                "[TTS] +500ms : audio a été TUÉ entre temps (ref null) — un autre useEffect a appelé stopTTS(). Probable cause : StrictMode dev double-render ou état qui flip.",
              );
              return;
            }
            const a = ttsAudioRef.current;
            console.log("[TTS] +500ms après play() →", {
              paused: a.paused,
              currentTime: a.currentTime,
              ended: a.ended,
              networkState: a.networkState,
              inDOM: !!a.parentNode,
            });
            if (a.paused || a.currentTime === 0) {
              console.warn(
                "[TTS] ⚠️ L'audio NE PROGRESSE PAS — souci système (output device, mixeur, exclusivité audio).",
              );
            } else {
              console.log(
                "[TTS] ✅ L'audio progresse normalement à",
                a.currentTime.toFixed(2),
                "s",
              );
            }
          }, 500);
        } catch (playErr) {
          console.error(
            "[TTS] audio.play() a échoué (autoplay bloqué ?) :",
            playErr,
          );
          throw playErr;
        }
        ttsPlayingRef.current = true;
        onTtsPlayingChange?.(true);
        // Synthèse OK : on notifie le TtsDock + on incrémente le compteur
        // de chars consommés pour le tier free tier monitoring.
        onTtsStatusChange?.("ok");
        onTtsCharsConsumed?.(text.length);
        tick();
      } catch (err) {
        // Erreur visible dans la console pour debug ; UI silencieuse.
        const name =
          err instanceof Error ? err.name : "(erreur sans nom)";
        if (name !== "AbortError") {
          console.error("[TTS] échec global :", err);
          onTtsStatusChange?.("error");
          // Fallback : Web Speech API native du navigateur. Voix moins
          // belle mais gratuite — utile quand Cartesia est en quota_exceeded
          // ou autre erreur (402, 500, etc.).
          tryBrowserTTSFallback(text);
        }
        stopTTS();
      }
    })();
  }, [messages, state, voiceOutput]);

  // Coupe la TTS UNIQUEMENT quand JARVIS recommence à réfléchir
  // (nouvelle requête). On NE STOPPE PAS sur "speaking" : ce state peut
  // être déclenché par la TTS elle-même (ttsPlaying → orbState="speaking")
  // → on s'auto-couperait dans une boucle infinie.
  useEffect(() => {
    if (state === "thinking") stopTTS();
  }, [state]);

  // Cleanup au démontage.
  useEffect(() => stopTTS, []);

  const startRecording = () => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert(
        "Reconnaissance vocale non supportée par ce navigateur. Utilise Chrome ou Edge.",
      );
      return;
    }
    const recog: AnySpeechRecognition = new SR();
    recog.lang = "fr-FR";
    recog.continuous = false;
    recog.interimResults = true;

    let finalText = "";
    recog.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    recog.onend = () => {
      setRecording(false);
      stopAudioMonitor();
      if (finalText.trim()) {
        onSend(finalText.trim());
        setInput("");
      }
    };
    recog.onerror = () => {
      setRecording(false);
      stopAudioMonitor();
    };

    recogRef.current = recog;
    recog.start();
    setRecording(true);
    void startAudioMonitor();
  };

  const stopRecording = () => {
    recogRef.current?.stop();
    setRecording(false);
    stopAudioMonitor();
  };

  // Push-to-talk depuis l'orbe (mobile/tablette) : on écoute un CustomEvent
  // dispatché par page.tsx au pointerdown/pointerup sur le réacteur. Démarre
  // / arrête la reconnaissance vocale sans coupler les composants.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPress = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      if (detail?.active) {
        if (!recording) startRecording();
      } else {
        if (recording) stopRecording();
      }
    };
    window.addEventListener("jarvis-press-to-talk", onPress);
    return () => window.removeEventListener("jarvis-press-to-talk", onPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // Petit bip d'acquittement (880 Hz, ~150 ms) joué via Web Audio quand le
  // wake word est détecté — confirme à l'utilisateur que JARVIS l'a entendu.
  const playWakeBeep = () => {
    if (typeof window === "undefined") return;
    try {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      osc.onended = () => ctx.close().catch(() => {});
    } catch {
      // ignore — Web Audio indisponible
    }
  };

  // Wake word "JARVIS" via Picovoice Porcupine. Suspendu pendant un
  // enregistrement actif pour ne pas se battre avec le SpeechRecognition.
  const { status: wakeWordStatus } = useWakeWord({
    enabled: wakeWordEnabled && !recording,
    onDetect: () => {
      if (recording) return;
      // Coupe la TTS en cours pour que l'utilisateur puisse parler immédiatement.
      stopTTS();
      // Bip + flash visuel (déclenché côté page via callback).
      playWakeBeep();
      onWakeWordDetect?.();
      startRecording();
    },
  });

  const readFileAsDataURL = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });

  const ingestImageFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Seules les images sont acceptées.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert("Image trop volumineuse (5 MB max).");
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      setPendingImage(dataUrl);
    } catch {
      alert("Impossible de lire le fichier.");
    }
  };

  // Drag & drop sur toute la fenêtre (mobile = paperclip)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      void ingestImageFile(file);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const handleSubmit = () => {
    // Si une slash command est en cours, Enter exécute la commande
    // sélectionnée au lieu d'envoyer le message
    if (slashOpen && slashFiltered.length > 0) {
      const cmd = slashFiltered[slashIndex] ?? slashFiltered[0];
      void cmd.action();
      setInput("");
      if (typeof window !== "undefined" && window.innerWidth >= 1024) {
        requestAnimationFrame(() => mainInputRef.current?.focus());
      }
      return;
    }
    const text = input.trim();
    if (!text && !pendingImage) return;
    onSend(text, pendingImage ?? undefined);
    setInput("");
    setPendingImage(null);
    // a11y : restaure le focus sur l'input après envoi pour que l'utilisateur
    // clavier puisse enchaîner sans aller chercher la souris
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      requestAnimationFrame(() => mainInputRef.current?.focus());
    }
  };

  const handleSlashPick = (cmd: JarvisCommand) => {
    void cmd.action();
    setInput("");
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      requestAnimationFrame(() => mainInputRef.current?.focus());
    }
  };

  // STOP : pendant un fetch en cours, le bouton ENVOYER se transforme en STOP.
  // On annule le fetch côté parent, on coupe la TTS, et on marque le contenu
  // partiel comme "déjà lu" pour ne pas le faire prononcer après l'arrêt.
  const handleStop = () => {
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant") {
      lastSpokenRef.current = last.content;
    }
    stopTTS();
    onStop?.();
  };

  const inFlight = state === "thinking" || state === "speaking";

  const messageBubbles = (
    <AnimatePresence initial={false}>
      {messages.map((m) => (
        <Message key={m.id} message={m} ultronMode={ultronMode} />
      ))}
    </AnimatePresence>
  );

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Chat plein écran (mobile uniquement) */}
      <AnimatePresence>
        {mobileChatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 flex flex-col bg-jarvis-bg/95 backdrop-blur-md sm:hidden"
            style={{
              // Respecte le notch / Dynamic Island en haut + la home bar en
              // bas sur iPhone X+ (viewportFit=cover dans layout.tsx).
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-jarvis-cyan/20">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse" />
                <span className="font-display tracking-[0.3em] text-[11px] text-jarvis-cyan">
                  CONVERSATION
                </span>
              </div>
              <button
                onClick={() => setMobileChatOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-lg bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20"
                aria-label="Fermer la conversation"
              >
                <X size={16} />
              </button>
            </div>
            <div
              ref={mobileScrollRef}
              className="flex-1 overflow-y-auto thin-scroll px-4 py-4 space-y-3 pb-28"
            >
              {messageBubbles}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay drag-and-drop plein écran */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 grid place-items-center bg-jarvis-bg/80 backdrop-blur-sm pointer-events-none"
          >
            <div className="glass-panel border-2 border-dashed border-jarvis-cyan/60 rounded-2xl px-10 py-8 grid place-items-center gap-3">
              <ImageIcon size={48} className="text-jarvis-cyan" />
              <div className="font-display tracking-[0.3em] text-sm text-jarvis-cyan">
                DÉPOSE L'IMAGE
              </div>
              <div className="font-mono text-[10px] text-jarvis-muted">
                JPG · PNG · WEBP · 5 MB MAX
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void ingestImageFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-3 sm:px-8 chat-panel-position"
        style={{
          // pb-4/sm:pb-6 d'origine + safe-area-inset-bottom pour que la
          // home bar des iPhone X+ ne chevauche pas les boutons.
          paddingBottom:
            "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Console terminal — EN HAUT du panneau lg+. Affiche la saisie en
            cours avec un look "ordinateur à l'ancienne". */}
        {/* Console terminal visible uniquement quand l'utilisateur a tapé
            quelque chose. Pendant `thinking`, l'état est désormais signalé
            par la bordure d'écran (ScreenBorderPulse) — pas besoin de
            redondance dans la console. */}
        {input && (
          <div className="hidden lg:block mb-3 max-w-full">
            <div className="font-display tracking-[0.35em] text-[10px] text-jarvis-cyan/70 mb-1">
              ›  YOU
            </div>
            <div
              className="font-terminal text-base lg:text-lg leading-snug break-words text-jarvis-cyan"
              style={{ wordBreak: "break-word" }}
            >
              {input}
              <span
                className="text-jarvis-cyan ml-0.5"
                style={{
                  animation: "caret-blink 1s steps(1) infinite",
                  textShadow: "0 0 6px #00d4ff",
                }}
              >
                █
              </span>
            </div>
          </div>
        )}

        {/* Messages flottants — alignés à gauche du panneau (style terminal),
            tous les messages (user et assistant) suivent le flux gauche→droite. */}
        <div
          ref={scrollRef}
          className={cn(
            "mb-4 max-h-[40vh] overflow-y-auto thin-scroll text-left",
            "space-y-5 pr-2 hidden sm:block",
            "sm:mx-auto sm:max-w-3xl",
            "lg:mx-0 lg:max-w-none lg:w-full lg:flex-1 lg:max-h-none lg:mb-3",
          )}
        >
          {messageBubbles}
        </div>

        {/* Barre de saisie — en bas, full-width centrée sur mobile, et
            détachée du panneau droit pour être centrée en bas sur lg+. */}
        <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-none lg:fixed lg:bottom-4 lg:left-1/2 lg:-translate-x-1/2 lg:z-30 lg:w-auto">
          {/* Slash menu (popup au-dessus de l'input quand on tape `/`) */}
          <div className="relative">
            <SlashMenu
              open={slashOpen}
              query={input}
              commands={slashCommands}
              selectedIndex={slashIndex}
              onSelectIndexChange={setSlashIndex}
              onPick={handleSlashPick}
            />
          </div>

          {/* Preview de l'image en cours d'envoi */}
          <AnimatePresence>
            {pendingImage && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className="mb-2 inline-flex items-center gap-2 glass-panel rounded-xl p-2 pr-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingImage}
                  alt="Aperçu"
                  className="h-14 w-14 rounded-lg object-cover border border-jarvis-cyan/40"
                />
                <div className="font-mono text-[10px] text-jarvis-cyan tracking-wider">
                  IMAGE JOINTE
                </div>
                <button
                  onClick={() => setPendingImage(null)}
                  className="h-7 w-7 grid place-items-center rounded-lg bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-danger/20 hover:text-jarvis-danger transition"
                  aria-label="Retirer l'image"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="glass-panel rounded-2xl px-1.5 sm:px-2 py-1.5 flex items-center gap-1 sm:gap-1.5 lg:w-fit lg:mx-auto">
            {/* Bouton micro — toggle reco vocale */}
            <button
              onClick={recording ? stopRecording : startRecording}
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 grid place-items-center rounded-xl transition",
                recording
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan animate-pulse"
                  : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label={recording ? "Arrêter l'écoute" : "Activer le micro"}
              title={recording ? "Arrêter l'écoute" : "Activer le micro"}
            >
              {recording ? <MicOff size={17} /> : <Mic size={17} />}
            </button>

            {/* Bouton trombone — joindre une image */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 grid place-items-center rounded-xl transition",
                pendingImage
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                  : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label="Joindre une image"
              title="Joindre une image"
            >
              <Paperclip size={17} />
            </button>

            {/* Input texte — visible mobile/sm/md, invisible mais focusable lg+
                (la saisie s'affiche dans la console terminal au-dessus). */}
            <input
              ref={mainInputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSlashIndex(0); // reset à chaque frappe
              }}
              onKeyDown={(e) => {
                // Navigation slash menu si ouvert
                if (slashOpen && slashFiltered.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashIndex((i) =>
                      Math.min(slashFiltered.length - 1, i + 1),
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashIndex((i) => Math.max(0, i - 1));
                    return;
                  }
                  if (e.key === "Tab") {
                    // Tab → autocomplète la commande (pas d'exécution)
                    e.preventDefault();
                    const cmd = slashFiltered[slashIndex] ?? slashFiltered[0];
                    setInput(`/${cmd.id}`);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setInput("");
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              onBlur={() => {
                if (
                  typeof window !== "undefined" &&
                  window.innerWidth >= 1024
                ) {
                  setTimeout(() => mainInputRef.current?.focus(), 0);
                }
              }}
              placeholder={
                state === "thinking"
                  ? ultronMode
                    ? "ULTRON réfléchit..."
                    : "JARVIS réfléchit..."
                  : ultronMode
                    ? "Parlez à ULTRON..."
                    : "Parlez à JARVIS..."
              }
              disabled={state === "thinking"}
              className={cn(
                "flex-1 min-w-0 bg-transparent outline-none px-2 text-jarvis-text",
                "placeholder:text-jarvis-muted font-body text-[15px]",
                "disabled:opacity-50",
                "lg:sr-only",
              )}
            />

            {/* Bouton conversation (mobile uniquement) — ouvre l'overlay des messages */}
            {hasMessages && (
              <button
                onClick={() => setMobileChatOpen((v) => !v)}
                className={cn(
                  "h-9 w-9 shrink-0 grid place-items-center rounded-xl transition sm:hidden",
                  mobileChatOpen
                    ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                    : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
                )}
                aria-label="Afficher la conversation"
                title="Afficher la conversation"
              >
                <MessageSquare size={17} />
              </button>
            )}

            {/* Menu ⋯ overflow (mobile uniquement, < sm). Regroupe wake
                word + music + command palette pour libérer la barre sur
                petits écrans. Sur sm+ chaque bouton s'affiche en clair. */}
            <div ref={overflowRef} className="relative sm:hidden">
              <button
                onClick={() => setOverflowOpen((v) => !v)}
                className={cn(
                  "h-9 w-9 shrink-0 grid place-items-center rounded-xl transition",
                  overflowOpen ||
                    musicMode ||
                    (wakeWordEnabled && wakeWordStatus === "listening")
                    ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                    : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
                )}
                aria-label="Plus d'options"
                aria-expanded={overflowOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal size={17} />
              </button>

              <AnimatePresence>
                {overflowOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute bottom-full mb-2 right-0 glass-panel border border-jarvis-cyan/25 rounded-xl p-1.5 flex flex-col gap-1 min-w-[200px] z-50"
                    role="menu"
                  >
                    {/* Wake word */}
                    <button
                      onClick={() => {
                        setWakeWordEnabled((v) => !v);
                        setOverflowOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-jarvis-text hover:bg-jarvis-cyan/15 transition"
                      role="menuitem"
                    >
                      <Radio
                        size={15}
                        className={
                          wakeWordEnabled
                            ? "text-jarvis-cyan"
                            : "text-jarvis-muted"
                        }
                      />
                      <span className="font-display text-[12px] tracking-wide flex-1">
                        Wake word
                      </span>
                      {wakeWordEnabled && (
                        <span className="font-mono text-[9px] text-jarvis-cyan tracking-widest">
                          ON
                        </span>
                      )}
                    </button>

                    {/* Mode musique */}
                    <button
                      onClick={() => {
                        void toggleMusicMode();
                        setOverflowOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-jarvis-text hover:bg-jarvis-cyan/15 transition"
                      role="menuitem"
                    >
                      <Music
                        size={15}
                        className={
                          musicMode ? "text-jarvis-cyan" : "text-jarvis-muted"
                        }
                      />
                      <span className="font-display text-[12px] tracking-wide flex-1">
                        Mode musique
                      </span>
                      {musicMode && (
                        <span className="font-mono text-[9px] text-jarvis-cyan tracking-widest">
                          ON
                        </span>
                      )}
                    </button>

                    {/* Command palette — équivalent Ctrl+K sur desktop */}
                    <button
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(
                            new CustomEvent("jarvis-open-palette"),
                          );
                        }
                        setOverflowOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-jarvis-text hover:bg-jarvis-cyan/15 transition"
                      role="menuitem"
                    >
                      <Command size={15} className="text-jarvis-muted" />
                      <span className="font-display text-[12px] tracking-wide flex-1">
                        Commandes
                      </span>
                      <span className="font-mono text-[9px] text-jarvis-muted tracking-widest">
                        ⌘K
                      </span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bouton wake word — détection passive du mot "JARVIS".
                Caché sur mobile (< sm) où il vit dans le menu ⋯. */}
            <button
              onClick={() => setWakeWordEnabled((v) => !v)}
              title={
                wakeWordStatus === "error"
                  ? "Wake word indisponible : ajoute NEXT_PUBLIC_PICOVOICE_KEY"
                  : wakeWordEnabled
                    ? `Dis "JARVIS" pour activer le micro`
                    : "Activer la détection du wake word"
              }
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 hidden sm:grid place-items-center rounded-xl transition relative",
                wakeWordEnabled && wakeWordStatus === "listening"
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                  : wakeWordEnabled && wakeWordStatus === "loading"
                    ? "bg-jarvis-cyan/10 text-jarvis-cyan animate-pulse"
                    : wakeWordEnabled && wakeWordStatus === "error"
                      ? "bg-jarvis-cyan/10 text-jarvis-cyan/40 opacity-60"
                      : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label="Wake word"
            >
              <Radio size={17} />
              {wakeWordEnabled && wakeWordStatus === "listening" && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse" />
              )}
            </button>

            {/* Bouton synthèse vocale — lit les réponses de JARVIS via Cartesia */}
            <button
              onClick={() => setVoiceOutput((v) => !v)}
              title={voiceOutput ? "Couper la voix" : "Activer la voix"}
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 grid place-items-center rounded-xl transition",
                voiceOutput
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                  : "bg-jarvis-cyan/10 text-jarvis-muted hover:bg-jarvis-cyan/20",
              )}
              aria-label={voiceOutput ? "Couper la voix" : "Activer la voix"}
              aria-pressed={voiceOutput}
            >
              {voiceOutput ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>

            {/* Bouton musique — analyse l'audio ambiant et fait pulser le
                réacteur sur les beats. Caché sur mobile (vit dans ⋯). */}
            <button
              onClick={() => {
                void toggleMusicMode();
              }}
              title={
                musicMode
                  ? "Couper l'écoute musicale"
                  : "Faire réagir le réacteur à la musique"
              }
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 hidden sm:grid place-items-center rounded-xl transition",
                musicMode
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan animate-pulse"
                  : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label={
                musicMode
                  ? "Couper le mode musique"
                  : "Activer le mode musique"
              }
              aria-pressed={musicMode}
            >
              <Music size={17} />
            </button>

            {/* Bouton map — affiche/cache le panneau cartographique */}
            <button
              onClick={onToggleMap}
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 grid place-items-center rounded-xl transition",
                mapOpen
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                  : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label="Carte"
              title="Carte"
            >
              <Map size={17} />
            </button>

            {/* Send / Stop — cachés sur lg+ (Enter suffit) */}
            {inFlight && onStop ? (
              <button
                onClick={handleStop}
                className={cn(
                  "h-9 w-9 sm:h-10 sm:w-auto sm:px-3 shrink-0 rounded-xl grid sm:flex place-items-center sm:items-center gap-2 transition font-display tracking-widest text-xs",
                  "bg-jarvis-cyan/30 text-jarvis-cyan border border-jarvis-cyan/50 hover:bg-jarvis-cyan/40",
                  "lg:hidden",
                )}
                aria-label="Arrêter la génération"
                title="Arrêter la génération"
              >
                <Square size={11} fill="currentColor" />
                <span className="hidden sm:inline">STOP</span>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() && !pendingImage}
                className={cn(
                  "h-9 w-9 sm:h-10 sm:w-auto sm:px-3 shrink-0 rounded-xl grid sm:flex place-items-center sm:items-center gap-2 transition font-display tracking-widest text-xs",
                  "bg-jarvis-cyan text-jarvis-bg hover:bg-jarvis-cyan/90",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  "lg:hidden",
                )}
                aria-label="Envoyer"
              >
                <Send size={13} />
                <span className="hidden sm:inline">ENVOYER</span>
              </button>
            )}

            {/* Gadgets HUD purement décoratifs (md+) :
                - mini-bars FFT animées
                - dot pulsant
                - tag mono
                pointer-events-none pour ne pas voler les clics du SEND. */}
            <div className="hidden md:flex items-center gap-2 pl-2 ml-0.5 border-l border-jarvis-cyan/15 pointer-events-none">
              <div className="flex items-end gap-[2px] h-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ scaleY: [0.35, 1, 0.55, 0.85, 0.35] }}
                    transition={{
                      duration: 1.4 + i * 0.18,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.07,
                    }}
                    style={{
                      transformOrigin: "bottom",
                      boxShadow: "0 0 4px rgba(0,212,255,0.55)",
                    }}
                    className="w-[2px] h-full bg-jarvis-cyan/70 rounded-sm"
                  />
                ))}
              </div>
              <div
                className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan animate-pulse"
                style={{ boxShadow: "0 0 6px rgba(0,212,255,0.7)" }}
              />
              <span className="font-mono text-[8px] tracking-[0.3em] text-jarvis-cyan/60">
                TX
              </span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
