"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { JarvisOrb } from "@/components/JarvisOrb";
// Lazy : pas de SSR (canvas + window.matchMedia), allège le bundle initial
const ParticleField = dynamic(
  () => import("@/components/ParticleField").then((m) => m.ParticleField),
  { ssr: false },
);
import { ChatInterface } from "@/components/ChatInterface";
import { HudFrame } from "@/components/HudFrame";
import { BootSequence } from "@/components/BootSequence";
import { BootSoundtrack } from "@/components/BootSoundtrack";
import { WakeUpOverlay } from "@/components/WakeUpOverlay";
import { Crosshair } from "@/components/Crosshair";
import { SideTelemetry } from "@/components/SideTelemetry";
import { GlitchOverlay } from "@/components/GlitchOverlay";
import { MiniRadar } from "@/components/MiniRadar";
import { IncomingTransmission } from "@/components/IncomingTransmission";
import { OutgoingTransmission } from "@/components/OutgoingTransmission";
import { SolarCycle } from "@/components/SolarCycle";
import { NewsTicker } from "@/components/NewsTicker";
import { NeuralPulse } from "@/components/NeuralPulse";
import { ScreenBorderPulse } from "@/components/ScreenBorderPulse";
import { TokenRipple } from "@/components/TokenRipple";
import { MessageTrail } from "@/components/MessageTrail";
import { ToolChip } from "@/components/ToolChip";
import { TopRightInfo } from "@/components/TopRightInfo";
import { UltronOverlay } from "@/components/UltronOverlay";
import { PerfDock } from "@/components/PerfDock";
import { TtsDock } from "@/components/TtsDock";
import { SourcesPanel, type WebSource } from "@/components/SourcesPanel";
import { CommandPalette } from "@/components/CommandPalette";
import {
  exportConversationMarkdown,
  type JarvisCommand,
} from "@/lib/commands";
import { useDeskNotification } from "@/lib/useDeskNotification";
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
  // Mode musique ambiante : analyse l'audio du micro et fait pulser le
  // réacteur sur les beats (visuel distinct de `speaking`).
  const [musicMode, setMusicMode] = useState(false);
  const [beatCount, setBeatCount] = useState(0);
  // True quand la piste de boot joue effectivement. Quand `musicMode` est
  // ON, on alimente le visuel music depuis l'audio du boot (signal interne
  // garanti audible, vs le micro qui ne capte que faiblement les HP). Si
  // le boot n'est plus actif, ChatInterface ouvre le micro en fallback.
  const [bootMusicPlaying, setBootMusicPlaying] = useState(false);
  // Mode Ultron : palette rouge + voix alternative (skull emoji activable)
  const [ultronMode, setUltronMode] = useState(false);
  const [wakeFlashKey, setWakeFlashKey] = useState(0);
  const [webSources, setWebSources] = useState<WebSource[]>([]);
  const [webSourcesQuery, setWebSourcesQuery] = useState<string>("");
  // Métriques API affichées dans PerfDock
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [apiStatus, setApiStatus] = useState<
    "ok" | "pending" | "error" | "idle"
  >("idle");
  // Métriques TTS affichées dans TtsDock (à droite de PerfDock)
  const [ttsProvider, setTtsProvider] = useState<
    "cartesia" | "elevenlabs" | "elevenlabs-ultron" | null
  >(null);
  const [ttsStatus, setTtsStatus] = useState<
    "ok" | "pending" | "error" | "idle"
  >("idle");
  const [ttsLatencyMs, setTtsLatencyMs] = useState<number | null>(null);
  const [ttsCharsThisSession, setTtsCharsThisSession] = useState(0);
  const userLocationRef = useRef<UserLocation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // True quand les pins viennent d'un tool result (find_nearby) — empêche
  // le LLM d'écraser avec un bloc [[MAP]] aux coordonnées hallucinées en
  // fin de stream.
  const pinsFromToolRef = useRef(false);
  // Ref stable sur `messages` pour éviter de recréer sendMessage à chaque
  // mise à jour (évite race condition + re-render inutile de ChatInterface)
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Notification système quand JARVIS finit sa réponse en arrière-plan
  const lastAssistantContent = (() => {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? last.content : undefined;
  })();
  useDeskNotification({ state, lastAssistantContent });

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

  // L'autoplay des navigateurs requiert un "user activation" explicite
  // (click / keydown / touchstart). `mousemove` ne compte PAS — on l'exclut
  // sinon le greeting TTS sera bloqué par la policy audio.
  const [hasInteracted, setHasInteracted] = useState(false);
  useEffect(() => {
    if (hasInteracted) return;
    const onInteract = () => setHasInteracted(true);
    window.addEventListener("keydown", onInteract, { once: true });
    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("touchstart", onInteract, { once: true });
    return () => {
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("touchstart", onInteract);
    };
  }, [hasInteracted]);

  // Indique qu'on doit commencer le fade out de la musique du boot.
  // Devient `true` à la PREMIÈRE interaction APRÈS la fin du boot — pas
  // l'interaction initiale (qui sert juste à débloquer l'autoplay).
  const [shouldFadeOutMusic, setShouldFadeOutMusic] = useState(false);
  useEffect(() => {
    if (shouldFadeOutMusic) return;
    // Tant que le boot n'est pas done, on ne tracke pas les interactions
    if (bootStage !== "done") return;
    const onPostBootInteract = () => setShouldFadeOutMusic(true);
    window.addEventListener("keydown", onPostBootInteract, { once: true });
    window.addEventListener("click", onPostBootInteract, { once: true });
    window.addEventListener("pointerdown", onPostBootInteract, { once: true });
    window.addEventListener("touchstart", onPostBootInteract, { once: true });
    return () => {
      window.removeEventListener("keydown", onPostBootInteract);
      window.removeEventListener("click", onPostBootInteract);
      window.removeEventListener("pointerdown", onPostBootInteract);
      window.removeEventListener("touchstart", onPostBootInteract);
    };
  }, [shouldFadeOutMusic, bootStage]);

  // Salutation contextuelle selon l'heure locale — pool varié pour éviter
  // l'effet "JARVIS qui dit toujours pareil". 4 plages horaires × ~5 variantes
  // chacune = 20 ouvertures possibles, tirage aléatoire à chaque boot.
  const bootGreeting = () => {
    const h = new Date().getHours();
    let pool: string[];
    if (h >= 5 && h < 12) {
      pool = [
        "Bonjour Boss. Systèmes en ligne, prêt à attaquer la journée.",
        "Tous les systèmes sont opérationnels, Boss. Que voulez-vous accomplir aujourd'hui ?",
        "Bonjour. Café simulé en cours de chargement — heureusement, vous gérez le vrai.",
        "Au rapport, Boss. Diagnostics complets, rien à signaler.",
        "Bonjour Boss. J'écoute.",
        "Boss, bienvenue. Les capteurs sont calibrés.",
      ];
    } else if (h >= 12 && h < 18) {
      pool = [
        "Bon après-midi, Boss. Que puis-je faire pour vous ?",
        "Re-bonjour. Vos systèmes sont à jour, je reste à disposition.",
        "À votre service, Boss.",
        "Boss. Quoi de neuf à cette heure ?",
        "Tout est en ordre, Boss. Je vous écoute.",
        "Bon après-midi. Je suis prêt quand vous l'êtes.",
      ];
    } else if (h >= 18 && h < 23) {
      pool = [
        "Bonsoir Boss. Calme plat sur les capteurs — la place est à vous.",
        "Bonsoir. Tous les systèmes opérationnels.",
        "Bonsoir Boss. Comment puis-je vous être utile ce soir ?",
        "Boss, bonsoir. Je suis prêt.",
        "Bonsoir. Diagnostics nominaux, à votre disposition.",
        "Bonsoir Boss. La nuit s'annonce productive ?",
      ];
    } else {
      pool = [
        "Tard pour vous, Boss. Que puis-je faire ?",
        "Encore éveillé, Boss ? Je suis là.",
        "Bonsoir Boss. Veillée nocturne acceptée.",
        "Boss. Heure tardive, mais je suis opérationnel.",
        "Permettez-moi de noter l'heure inhabituelle, Boss. Au rapport.",
        "Bonsoir. Tous systèmes en veille active — à vos ordres.",
      ];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  };

  useEffect(() => {
    if (bootStage !== "done") return;
    // On n'attend PLUS hasInteracted pour afficher le greeting : si la
    // musique du boot a réussi à autoplay, le TTS Cartesia peut aussi
    // tenter de jouer (même policy). Si l'autoplay est bloqué, le greeting
    // s'affiche quand même côté texte et la voix se déclenchera à la
    // prochaine interaction (lastSpokenRef garde la trace pour éviter
    // de re-jouer si on rebondit dessus).
    setMessages((prev) =>
      prev.length === 0
        ? [
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: bootGreeting(),
            },
          ]
        : prev,
    );
  }, [bootStage]);

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
  //  - mode musique      → music     (anneaux concentriques pulsés au beat)
  //
  // Le mode `music` cède la priorité à toute interaction LLM ou vocale en
  // cours — il ne s'affiche que quand JARVIS est totalement au repos.
  const orbState: JarvisState =
    recording && state === "idle"
      ? "listening"
      : ttsPlaying && state === "idle"
        ? "speaking"
        : musicMode && state === "idle"
          ? "music"
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
      const nextHistory = [...messagesRef.current, userMsg];
      setMessages([
        ...nextHistory,
        { id: "pending", role: "assistant", content: "" },
      ]);
      setState("thinking");
      // Reset des pins : si la nouvelle réponse en produit, on les réaffichera ;
      // sinon on n'hérite pas des pins de la requête précédente.
      setPins([]);
      setMapOpen(false);
      pinsFromToolRef.current = false;
      // Reset des sources web — on n'affiche que celles de la question en cours.
      setWebSources([]);
      setWebSourcesQuery("");

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Latence : on chronomètre du démarrage du fetch jusqu'au [DONE]
      const t0 = performance.now();
      setApiStatus("pending");

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
                console.log(
                  "[page] tool_result reçu :",
                  evt.name,
                  "·",
                  evt.result?.results
                    ? `${evt.result.results.length} résultat(s)`
                    : "(pas d'array results)",
                  evt.result,
                );
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
                // news_headlines : on transforme la liste d'articles RSS en
                // sources affichables dans le panneau de gauche (snippet =
                // "Source · description").
                if (
                  evt.name === "news_headlines" &&
                  evt.result &&
                  Array.isArray(evt.result.articles)
                ) {
                  setWebSources(
                    evt.result.articles.map(
                      (a: {
                        title: string;
                        link: string;
                        description: string;
                        source: string;
                      }) => ({
                        title: a.title ?? "",
                        url: a.link ?? "",
                        content: a.description
                          ? `${a.source} · ${a.description}`
                          : a.source,
                      }),
                    ),
                  );
                  setWebSourcesQuery(
                    evt.result.topic
                      ? `actu · ${evt.result.topic}`
                      : "actualités du jour",
                  );
                }
                // hackernews_top : score / commentaires / âge → meta-info dans
                // le content, URL externe quand dispo sinon thread HN.
                if (
                  evt.name === "hackernews_top" &&
                  evt.result &&
                  Array.isArray(evt.result.items)
                ) {
                  setWebSources(
                    evt.result.items.map(
                      (h: {
                        title: string;
                        url: string | null;
                        hnUrl: string;
                        score: number;
                        commentsCount: number;
                        age: string;
                        author: string;
                      }) => ({
                        title: h.title ?? "",
                        url: h.url || h.hnUrl,
                        content: `▲ ${h.score} pts · 💬 ${h.commentsCount} · ${h.age} · @${h.author}`,
                      }),
                    ),
                  );
                  setWebSourcesQuery("Hacker News");
                }
                // wikipedia_summary : 1 seule "source" = l'extract complet,
                // c'est exactement le paragraphe sur lequel JARVIS s'appuie.
                // Thumbnail dispo si l'article a une image vedette.
                if (
                  evt.name === "wikipedia_summary" &&
                  evt.result &&
                  typeof evt.result.extract === "string"
                ) {
                  setWebSources([
                    {
                      title: evt.result.title ?? "",
                      url: evt.result.url ?? "",
                      content: evt.result.extract,
                      image: evt.result.thumbnail ?? undefined,
                    },
                  ]);
                  setWebSourcesQuery(
                    `Wikipedia · ${evt.result.lang ?? "fr"}`,
                  );
                }
                // define_word : 1 carte récapitulant les premières définitions
                if (
                  evt.name === "define_word" &&
                  evt.result &&
                  Array.isArray(evt.result.definitions) &&
                  evt.result.definitions.length > 0
                ) {
                  const defs = evt.result.definitions
                    .slice(0, 4)
                    .map(
                      (d: { partOfSpeech: string; gloss: string }) =>
                        `(${d.partOfSpeech}) ${d.gloss}`,
                    )
                    .join(" · ");
                  setWebSources([
                    {
                      title: `${evt.result.word} (${evt.result.lang})`,
                      url: evt.result.url ?? "",
                      content: defs,
                    },
                  ]);
                  setWebSourcesQuery("dictionnaire");
                }
                // country_info : 1 carte avec une synthèse compacte
                if (
                  evt.name === "country_info" &&
                  evt.result &&
                  typeof evt.result.name === "string"
                ) {
                  const r = evt.result as {
                    name: string;
                    flag: string;
                    flagPng: string;
                    capital: string | null;
                    population: number;
                    languages: string[];
                    currencies: Array<{ code: string; name: string }>;
                    mapUrl: string;
                  };
                  const parts = [
                    r.capital ? `Capitale : ${r.capital}` : null,
                    r.population
                      ? `Population : ${r.population.toLocaleString("fr-FR")}`
                      : null,
                    r.languages.length
                      ? `Langues : ${r.languages.slice(0, 3).join(", ")}`
                      : null,
                    r.currencies.length
                      ? `Monnaie : ${r.currencies.map((c) => `${c.name} (${c.code})`).join(", ")}`
                      : null,
                  ].filter(Boolean);
                  setWebSources([
                    {
                      title: `${r.flag ?? ""} ${r.name}`.trim(),
                      url: r.mapUrl ?? "",
                      content: parts.join(" · "),
                      image: r.flagPng || undefined,
                    },
                  ]);
                  setWebSourcesQuery("pays");
                }
                // github_repo : 1 carte projet
                if (
                  evt.name === "github_repo" &&
                  evt.result &&
                  typeof evt.result.fullName === "string"
                ) {
                  const r = evt.result as {
                    fullName: string;
                    url: string;
                    description: string | null;
                    language: string | null;
                    stars: number;
                    forks: number;
                    openIssues: number;
                    license: string | null;
                  };
                  const stats = [
                    `★ ${r.stars.toLocaleString("fr-FR")}`,
                    `⑂ ${r.forks.toLocaleString("fr-FR")}`,
                    `! ${r.openIssues}`,
                    r.language ?? null,
                    r.license ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  setWebSources([
                    {
                      title: r.fullName,
                      url: r.url,
                      content: `${r.description ?? "(pas de description)"} — ${stats}`,
                    },
                  ]);
                  setWebSourcesQuery("github");
                }
                // arxiv_search : N cartes (1 par paper)
                if (
                  evt.name === "arxiv_search" &&
                  evt.result &&
                  Array.isArray(evt.result.papers)
                ) {
                  setWebSources(
                    evt.result.papers.map(
                      (p: {
                        title: string;
                        summary: string;
                        authors: string[];
                        published: string;
                        abstractUrl: string;
                        categories: string[];
                      }) => ({
                        title: p.title,
                        url: p.abstractUrl,
                        content: `${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} · ${p.published} · ${p.categories.slice(0, 2).join(", ")} — ${p.summary.slice(0, 280)}`,
                      }),
                    ),
                  );
                  setWebSourcesQuery(
                    `arXiv · ${evt.result.query ?? ""}`,
                  );
                }
                // spacex_launches : 1 carte par mission, avec patch officiel
                if (evt.name === "spacex_launches" && evt.result) {
                  type Launch = {
                    name: string;
                    flightNumber: number;
                    date: string;
                    relativeDate: string;
                    rocket: string;
                    launchpad: string;
                    success: boolean | null;
                    details: string | null;
                    webcastUrl: string | null;
                    patchUrl: string | null;
                    upcoming: boolean;
                  };
                  const launches: Launch[] = [];
                  if (evt.result.latest) launches.push(evt.result.latest);
                  if (Array.isArray(evt.result.upcoming)) {
                    launches.push(...evt.result.upcoming);
                  }
                  if (launches.length > 0) {
                    setWebSources(
                      launches.map((l) => ({
                        title: l.name + (l.upcoming ? " · à venir" : ""),
                        url:
                          l.webcastUrl ??
                          `https://www.google.com/search?q=SpaceX+${encodeURIComponent(l.name)}`,
                        content: `${l.rocket} · ${l.launchpad} · ${l.relativeDate} (${l.date.slice(0, 10)})${l.details ? ` — ${l.details}` : ""}`,
                        image: l.patchUrl ?? undefined,
                      })),
                    );
                    setWebSourcesQuery("SpaceX");
                  }
                }
                // book_search : 1 carte par livre, avec couverture Open Library
                if (
                  evt.name === "book_search" &&
                  evt.result &&
                  Array.isArray(evt.result.books)
                ) {
                  setWebSources(
                    evt.result.books.map(
                      (b: {
                        title: string;
                        authors: string[];
                        firstPublishYear: number | null;
                        coverUrl: string | null;
                        openLibraryUrl: string;
                        subjects: string[];
                      }) => ({
                        title: b.title,
                        url: b.openLibraryUrl,
                        content: `${b.authors.slice(0, 3).join(", ") || "auteur inconnu"}${b.firstPublishYear ? ` · ${b.firstPublishYear}` : ""}${b.subjects.length ? ` · ${b.subjects.slice(0, 3).join(", ")}` : ""}`,
                        image: b.coverUrl ?? undefined,
                      }),
                    ),
                  );
                  setWebSourcesQuery(
                    `Open Library · ${evt.result.query ?? ""}`,
                  );
                }
                // nasa_apod : 1 carte avec photo intégrée + explication
                if (
                  evt.name === "nasa_apod" &&
                  evt.result &&
                  typeof evt.result.title === "string"
                ) {
                  const r = evt.result as {
                    title: string;
                    date: string;
                    explanation: string;
                    imageUrl: string | null;
                    hdImageUrl: string | null;
                  };
                  setWebSources([
                    {
                      title: r.title,
                      url:
                        r.hdImageUrl ??
                        r.imageUrl ??
                        `https://apod.nasa.gov/apod/ap${r.date.replace(/-/g, "").slice(2)}.html`,
                      content: `${r.date} — ${r.explanation.slice(0, 600)}`,
                      // On affiche l'image standard (pas HD) dans le panneau
                      // pour ne pas charger 5-10 MB. Le lien hd reste cliquable.
                      image: r.imageUrl ?? r.hdImageUrl ?? undefined,
                    },
                  ]);
                  setWebSourcesQuery("NASA APOD");
                }
                // Pour find_nearby : ouverture INSTANTANÉE de la carte avec
                // les broches retournées par Overpass — pas besoin d'attendre
                // que le LLM émette un bloc [[MAP]] à la fin (peu fiable
                // avec Mistral). Si le modèle pousse un [[MAP]] plus tard
                // les broches seront remplacées, mais l'utilisateur voit
                // déjà la carte pendant que JARVIS commente.
                if (
                  evt.name === "find_nearby" &&
                  evt.result &&
                  Array.isArray(evt.result.results)
                ) {
                  const nearbyPins: MapPin[] = evt.result.results
                    .filter(
                      (r: { lat?: unknown; lng?: unknown }) =>
                        typeof r.lat === "number" && typeof r.lng === "number",
                    )
                    .map(
                      (r: {
                        name?: string;
                        lat: number;
                        lng: number;
                        description?: string;
                        distance_m?: number;
                      }) => ({
                        name: r.name ?? "Lieu",
                        lat: r.lat,
                        lng: r.lng,
                        description: r.distance_m
                          ? `${r.distance_m} m${
                              r.description ? ` · ${r.description}` : ""
                            }`
                          : r.description,
                      }),
                    );
                  console.log(
                    "[page] find_nearby → pins extraits :",
                    nearbyPins.length,
                    nearbyPins,
                  );
                  if (nearbyPins.length) {
                    setPins(nearbyPins);
                    setMapOpen(true);
                    pinsFromToolRef.current = true;
                    console.log(
                      "[page] setPins + setMapOpen(true) appelés → pinsFromToolRef.current = true",
                    );
                  }
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

        // Le [[MAP]] du LLM ne doit PAS écraser les pins d'un tool result :
        // Mistral hallucine régulièrement des coordonnées en émettant ce bloc.
        // On ne prend ses pins que si find_nearby n'en a pas déjà fourni.
        if (
          detectedPins &&
          detectedPins.length &&
          !pinsFromToolRef.current
        ) {
          setPins(detectedPins);
          setMapOpen(true);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setApiStatus("error");
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
        // Mesure de latence + statut API pour le PerfDock
        setLastLatencyMs(performance.now() - t0);
        setApiStatus((s) => (s === "error" ? "error" : "ok"));
      }
    },
    [requestGeolocation],
  );

  // Annule un fetch en cours. Le `finally` de sendMessage rebascule l'état
  // en idle et purge `activeTool`. La TTS partielle est stoppée côté
  // ChatInterface (qui marque la réponse comme déjà parlée pour éviter de la
  // lire après l'arrêt).
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Liste des commandes JARVIS (slash menu + Ctrl+K palette).
  // Mémoisée sur les states qu'elles consomment.
  const commands: JarvisCommand[] = useMemo(
    () => [
      {
        id: "clear",
        label: "Effacer la conversation",
        description: "Repart de zéro (messages, pins, sources)",
        category: "session",
        action: () => {
          setMessages([]);
          setPins([]);
          setMapOpen(false);
          setWebSources([]);
          setActiveTool(null);
          setLastLatencyMs(null);
        },
      },
      {
        id: "map",
        label: mapOpen ? "Fermer la carte" : "Ouvrir la carte",
        description: "Bascule l'affichage cartographique",
        category: "view",
        action: () => setMapOpen((v) => !v),
      },
      {
        id: "stop",
        label: "Arrêter la génération",
        description: "Annule la requête LLM en cours",
        category: "session",
        action: () => handleStop(),
      },
      {
        id: "export",
        label: "Exporter la conversation",
        description: "Télécharge le chat en .md",
        category: "data",
        action: () => exportConversationMarkdown(messagesRef.current),
      },
      {
        id: "geoloc",
        label: "Recharger ma position",
        description: "Demande à nouveau la géolocalisation au navigateur",
        category: "system",
        action: () => {
          userLocationRef.current = null;
          setUserLocation(null);
          void requestGeolocation();
        },
      },
      {
        id: "help",
        label: "Aide",
        description: "Affiche la liste des commandes",
        category: "system",
        action: () => {
          const list = [
            "**Commandes disponibles** :",
            "",
            "- `/clear` — effacer la conversation",
            "- `/map` — ouvrir/fermer la carte",
            "- `/stop` — arrêter la génération en cours",
            "- `/export` — télécharger la conv en markdown",
            "- `/geoloc` — recharger la géolocalisation",
            "- `/help` — afficher cette aide",
            "",
            "Astuce : `Ctrl+K` (ou `⌘K`) ouvre la palette globale.",
          ].join("\n");
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: list,
            },
          ]);
        },
      },
    ],
    [mapOpen, handleStop, requestGeolocation],
  );

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
    <main
      className={`relative h-[100dvh] w-screen overflow-hidden ${ultronMode ? "ultron-mode" : ""}`}
    >
      {/* Toggle Ultron — bouton placé SOUS le crochet d'angle dans la pile
          verticale gauche : crochet → skull → JARVIS → SYS. Décalé plus bas
          (top-[68px]) pour suivre le décalage du crochet sous le ticker. */}
      {reached("done") && (
        <button
          onClick={() => setUltronMode((v) => !v)}
          title={ultronMode ? "Désactiver mode Ultron" : "Activer mode Ultron"}
          className="fixed top-[68px] left-3 z-[200] h-7 w-7 grid place-items-center rounded-md font-mono text-base pointer-events-auto hologram-flicker"
          style={{
            // En mode Ultron : couleurs source ORANGE + contre-filtre qui
            // neutralise EXACTEMENT le filtre du conteneur `.ultron-mode`
            // (hue-rotate 172 saturate 1.55 brightness 0.82 contrast 1.18).
            // Inverses : 188, 0.645, 1.22, 0.847. Résultat : la tête de mort
            // apparaît vraiment orange à l'écran.
            // Le halo pulsant `ultron-skull-halo` la fait respirer en rouge.
            background: ultronMode
              ? "rgba(255, 140, 0, 0.22)"
              : "rgba(7, 13, 26, 0.5)",
            border: `1px solid ${ultronMode ? "rgba(255, 140, 0, 0.75)" : "rgba(0,212,255,0.25)"}`,
            color: ultronMode ? "#ff8c00" : "rgba(0,212,255,0.55)",
            filter: ultronMode
              ? "hue-rotate(188deg) saturate(0.645) brightness(1.22) contrast(0.847)"
              : undefined,
            animation: ultronMode
              ? "ultron-skull-halo 1.8s ease-in-out infinite"
              : undefined,
            cursor: "pointer",
            transition: "background 200ms, border 200ms, color 200ms",
          }}
          aria-label="Toggle Ultron mode"
        >
          ☠
        </button>
      )}
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
        <HudFrame ultronMode={ultronMode} />
        <SideTelemetry userLocation={userLocation ?? undefined} />
        <MiniRadar
          userLocation={userLocation ?? undefined}
          pins={pins}
        />
        <SolarCycle userLocation={userLocation} />
        <NeuralPulse state={orbState} audioLevel={audioLevel} />
      </motion.div>
      {/* News ticker en bas — fixed sur viewport, hors couche ambiente */}
      {chromeVisible && <NewsTicker />}

      {/* Bordure d'écran réactive — pulse selon l'état de JARVIS */}
      {chromeVisible && (
        <ScreenBorderPulse state={orbState} audioLevel={audioLevel} />
      )}

      {/* Header — réduit à l'info haut-droite (heure/date/météo). Padding
          top élevé (lg:pt-[72px]) pour que l'heure se place SOUS le crochet
          d'angle haut-droite du HudFrame (qui occupe y=32-64). Le label
          J.A.R.V.I.S est positionné absolument dans la colonne gauche. */}
      <motion.header
        initial={false}
        animate={{ opacity: chromeVisible ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-20 flex items-start justify-end px-4 sm:px-6 py-3 sm:py-4 lg:pt-[72px]"
        style={{ pointerEvents: chromeVisible ? "auto" : "none" }}
      >
        <TopRightInfo userLocation={userLocation} />
      </motion.header>

      {/* Label J.A.R.V.I.S — positionné absolument SOUS le bouton ☠
          (top-[68px] + h-7=28px = y=96 → on commence à top-[100px]).
          En mode Ultron : pastille rouge sang qui flicker au lieu du
          pulse cyan régulier, et lettrage avec text-shadow sanglante. */}
      <motion.div
        initial={false}
        animate={{ opacity: chromeVisible ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="fixed top-[100px] left-3 z-20 flex items-center gap-2 pointer-events-none hologram-flicker"
        style={
          ultronMode
            ? {
                // Contre-filtre pour neutraliser le hue-rotate du conteneur
                // .ultron-mode : les rouges écrits ci-dessous apparaissent
                // vraiment rouges à l'écran.
                filter:
                  "hue-rotate(188deg) saturate(0.645) brightness(1.22) contrast(0.847)",
              }
            : undefined
        }
      >
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${ultronMode ? "" : "bg-jarvis-cyan animate-pulse"}`}
          style={
            ultronMode
              ? {
                  background: "#ff1f2e",
                  boxShadow:
                    "0 0 8px #ff1f2e, 0 0 18px rgba(255, 0, 0, 0.5)",
                  animation:
                    "ultron-text-flicker 2.1s steps(10, end) infinite",
                }
              : undefined
          }
        />
        <span
          className="font-display tracking-[0.3em] text-[10px]"
          style={
            ultronMode
              ? {
                  color: "#ff6464",
                  textShadow:
                    "0 0 6px #ff1f2e, 0 0 14px rgba(255, 0, 0, 0.4)",
                  animation:
                    "ultron-text-flicker 4.3s steps(12, end) infinite",
                }
              : { color: "rgb(122, 144, 184)" }
          }
        >
          {ultronMode ? "U.L.T.R.O.N" : "J.A.R.V.I.S"}
        </span>
      </motion.div>

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
            style={{ transformOrigin: "center", position: "relative" }}
          >
            {/* Chip HUD du tool en cours — placé DANS le wrapper de l'orbe
                pour qu'il soit centré horizontalement sur le réacteur peu
                importe le layout (mobile/tablette/desktop). */}
            <ToolChip tool={activeTool} />
            <JarvisOrb
              state={orbState}
              audioLevel={audioLevel}
              audioBands={audioBands}
              beatCount={beatCount}
              ultronMode={ultronMode}
            />
            {/* Zone de push-to-talk — active uniquement sur mobile/tablette
                (lg:hidden). Maintien long sur l'orbe → micro actif. Relâche
                ou sortie → fin d'enregistrement + envoi. On dispatch un
                CustomEvent que ChatInterface intercepte pour démarrer/
                arrêter la reconnaissance vocale sans coupler les composants. */}
            <div
              aria-label="Maintenir pour parler à JARVIS"
              className="absolute inset-0 lg:hidden pointer-events-auto touch-none select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                window.dispatchEvent(
                  new CustomEvent("jarvis-press-to-talk", {
                    detail: { active: true },
                  }),
                );
              }}
              onPointerUp={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* no-op */
                }
                window.dispatchEvent(
                  new CustomEvent("jarvis-press-to-talk", {
                    detail: { active: false },
                  }),
                );
              }}
              onPointerCancel={() => {
                window.dispatchEvent(
                  new CustomEvent("jarvis-press-to-talk", {
                    detail: { active: false, cancelled: true },
                  }),
                );
              }}
            />
          </motion.div>
        )}
      </section>
      {/* Traînée lumineuse orbe ↔ chat (lg+) */}
      <MessageTrail messages={messages} />

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
          onTtsStatusChange={setTtsStatus}
          onTtsProviderChange={setTtsProvider}
          onTtsLatency={setTtsLatencyMs}
          onTtsCharsConsumed={(chars) =>
            setTtsCharsThisSession((c) => c + chars)
          }
          slashCommands={commands}
          ultronMode={ultronMode}
          onMusicModeChange={setMusicMode}
          onBeat={() => setBeatCount((n) => n + 1)}
          bootMusicActive={bootMusicPlaying}
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

      {/* ToolChip est désormais rendu DANS le wrapper de l'orbe (au-dessus
          du JarvisOrb), donc centré automatiquement sur le réacteur. */}

      {/* Statut API + tokens consommés en bas-gauche (lg+). Reste visible
          tout le temps une fois le boot terminé. */}
      {reached("done") && (
        <PerfDock
          messages={messages}
          lastLatencyMs={lastLatencyMs}
          apiStatus={apiStatus}
        />
      )}

      {/* Statut TTS (provider actif, latence, quota free tier) en bas-gauche,
          collé à droite du PerfDock. Visible une fois le boot terminé. */}
      {reached("done") && (
        <TtsDock
          provider={ttsProvider}
          status={ttsStatus}
          lastLatencyMs={ttsLatencyMs}
          charsThisSession={ttsCharsThisSession}
        />
      )}

      {/* Panneau de sources à gauche de l'orbe — alimenté par les résultats
          Tavily quand web_search est utilisé. */}
      <SourcesPanel sources={webSources} />

      {/* Boot panel intégré à l'interface : visible pendant le stage `loading`,
          disparaît une fois la barre pleine (`loaded`). */}
      <BootSequence
        visible={reached("loading") && !reached("loaded")}
        showBar={reached("loading")}
        barDurationMs={BOOT_BAR_DURATION}
      />

      {/* Instrumentale d'ambiance pendant le boot. Le MP3 doit être placé
          dans /public/audio/boot-theme.mp3 (l'instru "Should I Go?" / Iron
          Man 2 OST par ex.). Joue uniquement après une interaction utilisateur
          (autoplay policy), fade out à la fin du boot. */}
      <BootSoundtrack
        enabled={hasInteracted}
        playing={!shouldFadeOutMusic}
        src="/audio/boot-theme.mp3"
        maxVolume={0.45}
        fadeOutMs={60000}
        // Branche l'analyseur audio toujours : si l'utilisateur active
        // ensuite le bouton 🎵, le visuel music se nourrit déjà de la
        // piste du boot (son interne) au lieu du micro (souvent muet).
        onPlayingChange={setBootMusicPlaying}
        onAudioLevel={setAudioLevel}
        onAudioBands={setAudioBands}
        onBeat={() => setBeatCount((n) => n + 1)}
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

      {/* Command palette globale — Ctrl+K / Cmd+K depuis n'importe où */}
      <CommandPalette commands={commands} />

      {/* Surcouche Ultron — vignette rouge, bandeau ROGUE.PROTOCOL, scanline,
          glitch tear, indicateur CORE.INTEGRITY. Rendu via portal vers
          document.body pour échapper au filter hue-rotate du conteneur
          .ultron-mode (sinon les rouges deviendraient cyan). */}
      <UltronOverlay active={ultronMode} />
    </main>
  );
}
