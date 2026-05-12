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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWakeWord } from "@/lib/useWakeWord";
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
}: Props) {
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(true);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
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

  // Remonte l'état d'enregistrement au parent
  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

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
    if (ttsPlayingRef.current) {
      ttsPlayingRef.current = false;
      onTtsPlayingChange?.(false);
      onAudioLevel?.(0);
      onAudioBands?.(ZERO_BANDS);
    }
  };

  // Synthèse vocale du dernier message via Cartesia (/api/tts).
  useEffect(() => {
    if (!voiceOutput) {
      stopTTS();
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
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        const blob = await res.blob();
        if (ctrl.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        ttsObjectUrlRef.current = url;
        const audio = new Audio(url);
        audio.crossOrigin = "anonymous";
        ttsAudioRef.current = audio;

        // Branche l'audio sur un AnalyserNode pour piloter l'orbe en
        // temps réel (level + bandes FFT, même format que le mic).
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        ttsCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyser.connect(ctx.destination); // garde le son audible
        const timeBuf = new Uint8Array(analyser.fftSize);
        const freqBuf = new Uint8Array(analyser.frequencyBinCount);
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
          onAudioLevel?.(Math.min(1, rms * 4));

          analyser.getByteFrequencyData(freqBuf);
          const bands: number[] = new Array(FFT_BAND_COUNT);
          for (let b = 0; b < FFT_BAND_COUNT; b++) {
            let max = 0;
            const start = b * binsPerBand;
            const end = start + binsPerBand;
            for (let j = start; j < end; j++) {
              if (freqBuf[j] > max) max = freqBuf[j];
            }
            bands[b] = Math.pow(max / 255, 0.75);
          }
          onAudioBands?.(bands);

          ttsRafRef.current = requestAnimationFrame(tick);
        };

        audio.onended = () => {
          if (ttsObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            ttsObjectUrlRef.current = null;
          }
          stopTTS();
        };

        await audio.play();
        ttsPlayingRef.current = true;
        onTtsPlayingChange?.(true);
        tick();
      } catch {
        // silencieux : TTS indisponible ou aborté, on n'affiche pas d'erreur.
        stopTTS();
      }
    })();
  }, [messages, state, voiceOutput]);

  // Coupe la TTS quand JARVIS recommence à réfléchir/parler.
  useEffect(() => {
    if (state !== "idle") stopTTS();
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
    const text = input.trim();
    if (!text && !pendingImage) return;
    onSend(text, pendingImage ?? undefined);
    setInput("");
    setPendingImage(null);
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
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "max-w-[90%] text-[15px] leading-relaxed font-display tracking-[0.02em]",
            m.role === "user"
              ? "ml-auto text-right text-jarvis-cyan"
              : "mr-auto text-jarvis-text",
          )}
        >
          {m.role === "assistant" && (
            <div className="font-display tracking-[0.35em] text-[10px] text-jarvis-cyan mb-1">
              ›  JARVIS
            </div>
          )}
          {m.role === "user" && (
            <div className="font-display tracking-[0.35em] text-[10px] text-jarvis-cyan/70 mb-1">
              ‹  YOU
            </div>
          )}
          {m.role === "user" && m.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.image}
              alt="Image jointe"
              className="mb-2 ml-auto max-h-64 w-auto rounded-lg border border-jarvis-cyan/30"
            />
          )}
          {m.content && (
            <div
              className="whitespace-pre-wrap font-terminal text-base lg:text-lg leading-snug break-words"
              dangerouslySetInnerHTML={{
                __html: m.content
                  // Nettoie les blocs MAP et les appels d'outils "leakés" en
                  // texte par les LLMs qui ne maîtrisent pas tool_calls (ex:
                  // `?//{{find_nearby{"query":"..."}}}` ou variantes).
                  .replace(/\[\[MAP\]\][\s\S]*?\[\[\/MAP\]\]/g, "")
                  .replace(
                    /[?]?\/?\/?\{\{?\s*(find_nearby|web_search)\s*\{[^}]*\}\}?\}?/g,
                    "",
                  )
                  .replace(/^\s*[?/]+\s*$/gm, "")
                  .trim()
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/\*(.*?)\*/g, "<em>$1</em>")
                  .replace(
                    /`([^`]+)`/g,
                    '<code class="px-1 text-jarvis-cyan">$1</code>',
                  ),
              }}
            />
          )}
        </motion.div>
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

      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 sm:px-8 pb-4 sm:pb-6 lg:left-[65%] lg:right-[5%] lg:top-20 lg:bottom-24 lg:w-auto lg:max-w-none lg:px-0 lg:flex lg:flex-col">
        {/* Console terminal — EN HAUT du panneau lg+. Affiche la saisie en
            cours avec un look "ordinateur à l'ancienne". */}
        {(input || state === "thinking") && (
          <div className="hidden lg:flex items-center gap-3 mb-3 px-4 py-3 rounded-2xl glass-panel">
            <span className="font-terminal text-jarvis-cyan/70 text-2xl leading-none">
              ▸
            </span>
            <div className="flex-1 min-w-0 flex items-baseline">
              <span
                className="font-terminal text-lg text-jarvis-text glow-text-soft break-words"
                style={{ wordBreak: "break-word" }}
              >
                {input || (
                  <span className="text-jarvis-muted/60">
                    JARVIS réfléchit...
                  </span>
                )}
              </span>
              <span
                className="font-terminal text-lg text-jarvis-cyan ml-0.5 leading-none"
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

        {/* Messages flottants — décalés à droite sur grand écran pour
            laisser respirer l'orbe central. */}
        <div
          ref={scrollRef}
          className={cn(
            "mx-auto max-w-3xl mb-4 max-h-[40vh] overflow-y-auto thin-scroll",
            "space-y-3 pr-2 hidden sm:block",
            "lg:ml-auto lg:mr-8 xl:mr-16 lg:max-w-md xl:max-w-lg lg:max-h-[55vh] lg:mb-3",
          )}
        >
          {messageBubbles}
        </div>

        {/* Barre de saisie — en bas, full-width centrée sur mobile, et
            détachée du panneau droit pour être centrée en bas sur lg+. */}
        <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-none lg:fixed lg:bottom-4 lg:left-1/2 lg:-translate-x-1/2 lg:z-30 lg:w-auto">
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
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
                  ? "JARVIS réfléchit..."
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

            {/* Bouton wake word — détection passive du mot "JARVIS" */}
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
                "h-10 w-10 shrink-0 grid place-items-center rounded-xl transition hidden sm:grid relative",
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
              title="Lecture vocale des réponses"
              className={cn(
                "h-10 w-10 shrink-0 grid place-items-center rounded-xl transition hidden sm:grid",
                voiceOutput
                  ? "bg-jarvis-cyan/30 text-jarvis-cyan"
                  : "bg-jarvis-cyan/10 text-jarvis-cyan hover:bg-jarvis-cyan/20",
              )}
              aria-label="Activer la voix"
            >
              {voiceOutput ? <Volume2 size={17} /> : <VolumeX size={17} />}
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
