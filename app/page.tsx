"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { JarvisOrb } from "@/components/JarvisOrb";
import { ParticleField } from "@/components/ParticleField";
import { ChatInterface } from "@/components/ChatInterface";
import { HudFrame } from "@/components/HudFrame";
import { BootSequence } from "@/components/BootSequence";
import { WakeUpOverlay } from "@/components/WakeUpOverlay";
import { Crosshair } from "@/components/Crosshair";
import { SideTelemetry } from "@/components/SideTelemetry";
import { GlitchOverlay } from "@/components/GlitchOverlay";
import { MiniRadar } from "@/components/MiniRadar";
import { IncomingTransmission } from "@/components/IncomingTransmission";
import { ToolChip } from "@/components/ToolChip";
import { SourcesPanel, type WebSource } from "@/components/SourcesPanel";
import type { ChatMessage, JarvisState, MapPin, UserLocation } from "@/types";

// Map chargée côté client uniquement (Leaflet utilise window)
const MapPanel = dynamic(
  () => import("@/components/MapPanel").then((m) => m.MapPanel),
  { ssr: false },
);

// Timeline de boot (ms).
// 1. Blackout : écran noir total + battement cyan central qui s'intensifie
// 2. Waking : l'overlay noir fade-out lentement, on découvre l'interface
// 3. Loading : la barre de boot intégrée à l'interface se remplit
const BOOT_BLACKOUT_DURATION = 2500; // noir + battement cyan
const BOOT_WAKING_DURATION = 1500; // fade-out du noir
const BOOT_BAR_DELAY_AFTER_WAKE = 200; // pause après réveil avant la barre
const BOOT_BAR_DURATION = 2000; // remplissage de la barre

const BOOT_WAKING_START = BOOT_BLACKOUT_DURATION; // ~2500
const BOOT_WAKING_END = BOOT_WAKING_START + BOOT_WAKING_DURATION; // ~4000
const BOOT_BAR_START =
  BOOT_WAKING_END + BOOT_BAR_DELAY_AFTER_WAKE; // ~4200
const BOOT_BAR_END = BOOT_BAR_START + BOOT_BAR_DURATION; // ~6200
const BOOT_END = BOOT_BAR_END + 300; // ~6500

type BootStage =
  | "blackout"
  | "waking"
  | "loading"
  | "loaded"
  | "done";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<JarvisState>("idle");
  const [pins, setPins] = useState<MapPin[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBands, setAudioBands] = useState<number[]>(() =>
    new Array(12).fill(0),
  );
  const [bootStage, setBootStage] = useState<BootStage>("blackout");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [activeTool, setActiveTool] = useState<{
    name: string;
    query: string;
  } | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [wakeFlashKey, setWakeFlashKey] = useState(0);
  const [webSources, setWebSources] = useState<WebSource[]>([]);
  const [webSourcesQuery, setWebSourcesQuery] = useState<string>("");
  const userLocationRef = useRef<UserLocation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Demande la géolocalisation une fois. Si l'utilisateur refuse, on
  // retourne null et le tool find_nearby le signalera proprement au LLM.
  const requestGeolocation = useCallback((): Promise<UserLocation | null> => {
    if (userLocationRef.current) return Promise.resolve(userLocationRef.current);
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          userLocationRef.current = loc;
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
      );
    });
  }, []);

  // Heuristique : ce message pourrait avoir besoin de la position ?
  // On ne fait que déclencher la permission à l'avance ; le serveur
  // décide réellement via tool calling.
  const needsLocationHint = (text: string) => {
    const t = text.toLowerCase();
    return /(autour|près|proche|à proximité|proximit[eé]|trouve.{0,20}(boulang|patiss|p[âa]tiss|restau|pharma|caf[eé]|supermarch|[eé]picerie|parking|h[oô]tel|essence|tabac|m[eé]tro|gare|banque|cin[eé]ma|mus[eé]e|parc|fleur|coiffeur)|o[uù].{0,5}(puis|peux|trouver).{0,30}(boulang|restau|pharma|caf[eé]))/i.test(t);
  };

  useEffect(() => {
    const timers = [
      setTimeout(() => setBootStage("waking"), BOOT_WAKING_START),
      setTimeout(() => setBootStage("loading"), BOOT_BAR_START),
      setTimeout(() => setBootStage("loaded"), BOOT_BAR_END),
      setTimeout(() => setBootStage("done"), BOOT_END),
      // Demande la géoloc dès la fin du boot. Si l'utilisateur accepte,
      // la position est disponible pour toutes les requêtes suivantes.
      setTimeout(() => {
        void requestGeolocation();
      }, BOOT_END + 200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [requestGeolocation]);

  const stageOrder: Record<BootStage, number> = {
    blackout: 0,
    waking: 1,
    loading: 2,
    loaded: 3,
    done: 4,
  };
  const reached = (s: BootStage) => stageOrder[bootStage] >= stageOrder[s];

  // Priorités d'affichage de l'orbe :
  //  - mic actif         → listening (audio-réactif)
  //  - TTS en cours      → speaking  (audio-réactif sur la voix Cartesia)
  //  - state interne     → thinking / speaking pendant le streaming
  const orbState: JarvisState =
    recording && state === "idle"
      ? "listening"
      : ttsPlaying && state === "idle"
        ? "speaking"
        : state;

  const sendMessage = useCallback(
    async (content: string, image?: string) => {
      const trimmed = content.trim();
      if (!trimmed && !image) return;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        ...(image ? { image } : {}),
      };
      const nextHistory = [...messages, userMsg];
      setMessages([
        ...nextHistory,
        { id: "pending", role: "assistant", content: "" },
      ]);
      setState("thinking");
      // Reset des pins : si la nouvelle réponse en produit, on les réaffichera ;
      // sinon on n'hérite pas des pins de la requête précédente.
      setPins([]);
      setMapOpen(false);
      // Reset des sources web — on n'affiche que celles de la question en cours.
      setWebSources([]);
      setWebSourcesQuery("");

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Si on n'a pas encore de position et que le message en a probablement
      // besoin, on relance une demande EN PARALLÈLE (sinon on prend ce qu'on
      // a déjà — typiquement obtenu au boot).
      let locPromise: Promise<UserLocation | null> = Promise.resolve(
        userLocationRef.current,
      );
      if (!userLocationRef.current && needsLocationHint(trimmed)) {
        locPromise = requestGeolocation();
      }
      const loc = await locPromise;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextHistory,
            ...(loc ? { userLocation: loc } : {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error("Réponse invalide");

        setState("speaking");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let detectedPins: MapPin[] | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === "delta") {
                acc += evt.text;
              } else if (evt.type === "pins") {
                detectedPins = evt.pins;
              } else if (evt.type === "tool_call") {
                const q =
                  evt.args && typeof evt.args === "object"
                    ? (evt.args.query ?? "")
                    : "";
                setActiveTool({
                  name: String(evt.name ?? ""),
                  query: String(q),
                });
              } else if (evt.type === "tool_result") {
                // Pour web_search : on alimente le panneau de sources de gauche
                // avec les résultats Tavily pour que l'utilisateur voie sur
                // quoi JARVIS s'est appuyé.
                if (
                  evt.name === "web_search" &&
                  evt.result &&
                  Array.isArray(evt.result.results)
                ) {
                  setWebSources(
                    evt.result.results.map(
                      (r: { title: string; url: string; content: string }) => ({
                        title: r.title ?? "",
                        url: r.url ?? "",
                        content: r.content ?? "",
                      }),
                    ),
                  );
                  setWebSourcesQuery(String(evt.result.query ?? ""));
                }
              }
            } catch {
              // ignorer les chunks mal formés
            }
            setMessages([
              ...nextHistory,
              {
                id: "pending",
                role: "assistant",
                content: acc,
              },
            ]);
          }
        }

        setMessages([
          ...nextHistory,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: acc,
          },
        ]);

        if (detectedPins && detectedPins.length) {
          setPins(detectedPins);
          setMapOpen(true);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages([
            ...nextHistory,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "⚠️ Connexion au noyau interrompue. Vérifie ta clé API et réessaie.",
            },
          ]);
        }
      } finally {
        setState("idle");
        setActiveTool(null);
      }
    },
    [messages, requestGeolocation],
  );

  // Annule un fetch en cours. Le `finally` de sendMessage rebascule l'état
  // en idle et purge `activeTool`. La TTS partielle est stoppée côté
  // ChatInterface (qui marque la réponse comme déjà parlée pour éviter de la
  // lire après l'arrêt).
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Synthèse vocale du dernier message assistant
  useEffect(() => {
    if (state !== "idle") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Lecture désactivée par défaut, activable via bouton dans ChatInterface
  }, [state, messages]);

  // L'interface complète est rendue très tôt mais cachée par l'overlay noir
  // (WakeUpOverlay) pendant le blackout. L'orbe ne se mount qu'au stage
  // `waking` pour que l'utilisateur voie ses animations de construction
  // pendant que l'overlay fade-out (sinon elles auraient lieu cachées).
  const ambientVisible = reached("waking");
  const chromeVisible = reached("waking");
  const coreVisible = reached("waking");

  const mapActive = mapOpen && pins.length > 0;

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden">
      {/* Carte en fond — sous l'ambiant, le HUD et l'orbe. S'affiche dès
          qu'on a des broches à montrer (résultat de find_nearby ou autre). */}
      {mapActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
          className="absolute inset-0 z-0"
        >
          <MapPanel
            pins={pins}
            userLocation={userLocation ?? undefined}
            onClose={() => setMapOpen(false)}
          />
        </motion.div>
      )}

      {/* Couche ambiante : toujours montée pour ne pas affecter le layout,
          opacité contrôlée par le stage. Quand la carte est active, on retire
          la vignette radiale (qui crée un cadre noir autour de la carte) et
          on baisse fortement l'opacité globale pour ne plus la masquer. */}
      <motion.div
        initial={false}
        animate={{
          opacity: ambientVisible ? (mapActive ? 0.18 : 1) : 0,
        }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="absolute inset-0 z-[1] pointer-events-none"
      >
        {ambientVisible && <ParticleField />}
        <div className="absolute inset-0 hud-grid opacity-60 pointer-events-none" />
        <div className="absolute inset-0 hologram-lines opacity-50 pointer-events-none" />
        {!mapActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 40%, rgba(3,6,13,0.9) 100%)",
            }}
          />
        )}
        <HudFrame />
        <SideTelemetry userLocation={userLocation ?? undefined} />
        <MiniRadar
          userLocation={userLocation ?? undefined}
          pins={pins}
        />
      </motion.div>

      {/* Header — toujours dans le flow pour fixer la hauteur disponible
          de la section orbe ; on ne change que l'opacité. */}
      <motion.header
        initial={false}
        animate={{ opacity: chromeVisible ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4"
        style={{ pointerEvents: chromeVisible ? "auto" : "none" }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-2 w-2 shrink-0 rounded-full bg-jarvis-cyan animate-pulse" />
          <span className="font-display tracking-[0.3em] sm:tracking-[0.4em] text-[10px] sm:text-xs text-jarvis-muted truncate">
            J.A.R.V.I.S
          </span>
        </div>
        <div className="hidden sm:block font-mono text-[10px] text-jarvis-muted tabular-nums">
          {new Date().toISOString().slice(0, 19).replace("T", " ")}
        </div>
      </motion.header>

      {/* Zone centrale : orbe — centré au CENTRE EXACT de la viewport (pas
          la zone sub-header), pour que JARVIS soit pile au milieu de l'écran.
          Le header reste rendu en flow au-dessus mais ne décale plus l'orbe. */}
      <section className="absolute inset-0 z-10 grid place-items-center px-4 pointer-events-none">
        {coreVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, filter: "blur(8px)" }}
            animate={
              mapActive
                ? {
                    opacity: 1,
                    scale: 0.28,
                    x: 0,
                    y: "-36vh",
                    filter: "blur(0px)",
                  }
                : {
                    opacity: 1,
                    scale: 1,
                    x: 0,
                    y: 0,
                    filter: "blur(0px)",
                  }
            }
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "center" }}
          >
            <JarvisOrb
              state={orbState}
              audioLevel={audioLevel}
              audioBands={audioBands}
            />
            <IncomingTransmission state={orbState} />
          </motion.div>
        )}
      </section>

      {/* Chat — toujours monté, opacité héritée par le panneau fixed. */}
      <motion.div
        initial={false}
        animate={{ opacity: chromeVisible ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: chromeVisible ? 0.15 : 0 }}
        style={{ pointerEvents: chromeVisible ? "auto" : "none" }}
      >
        <ChatInterface
          messages={messages}
          state={orbState}
          onSend={sendMessage}
          onToggleMap={() => setMapOpen((v) => !v)}
          mapOpen={mapOpen}
          onRecordingChange={setRecording}
          onAudioLevel={setAudioLevel}
          onAudioBands={setAudioBands}
          onStop={handleStop}
          onTtsPlayingChange={setTtsPlaying}
          onWakeWordDetect={() => setWakeFlashKey((k) => k + 1)}
        />
      </motion.div>

      {/* Flash d'acquittement quand le wake word "JARVIS" est détecté */}
      <AnimatePresence>
        {wakeFlashKey > 0 && (
          <motion.div
            key={wakeFlashKey}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 1, 0], scale: [0.8, 1.3, 1.7] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="fixed inset-0 z-10 grid place-items-center pointer-events-none"
          >
            <div
              className="h-[420px] w-[420px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(103,232,249,0.4) 0%, rgba(0,212,255,0.15) 35%, transparent 70%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chip HUD du tool en cours d'utilisation par Claude (find_nearby,
          show_map, web_search…). Apparaît dès que le SSE émet un événement
          `tool_call` et disparaît à la fin du streaming. */}
      <ToolChip tool={activeTool} />

      {/* Panneau de sources à gauche de l'orbe — alimenté par les résultats
          Tavily quand web_search est utilisé. */}
      <SourcesPanel sources={webSources} query={webSourcesQuery} />

      {/* Boot panel intégré à l'interface : visible pendant le stage `loading`,
          disparaît une fois la barre pleine (`loaded`). */}
      <BootSequence
        visible={reached("loading") && !reached("loaded")}
        showBar={reached("loading")}
        barDurationMs={BOOT_BAR_DURATION}
      />

      {/* Overlay de réveil : écran totalement noir + battement cyan central
          qui s'intensifie. Fade-out lent quand on passe à `waking`,
          révélant l'interface JARVIS qui s'est construite dessous. */}
      <WakeUpOverlay
        blackout={!reached("waking")}
        blackoutDurationMs={BOOT_BLACKOUT_DURATION}
        wakingDurationMs={BOOT_WAKING_DURATION}
      />

      {/* Crosshair JARVIS — toujours rendu pour remplacer la souris native
          (masquée via globals.css en pointer:fine). */}
      <Crosshair />

      {/* Glitch épisodique très occasionnel */}
      {reached("done") && <GlitchOverlay />}
    </main>
  );
}
