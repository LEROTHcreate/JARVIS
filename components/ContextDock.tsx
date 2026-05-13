"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, UserLocation } from "@/types";

interface Props {
  userLocation?: UserLocation | null;
  messages: ChatMessage[];
  activeTool?: { name: string; query: string } | null;
  state?: string;
  recording?: boolean;
  ttsPlaying?: boolean;
  pinsCount?: number;
  mapOpen?: boolean;
}

// Mapping WMO weather codes → libellé court FR (Open-Meteo conventions)
const WEATHER_LABEL: Record<number, string> = {
  0: "CLAIR",
  1: "PEU NUAGEUX",
  2: "PARTIEL",
  3: "COUVERT",
  45: "BROUILLARD",
  48: "BRUME",
  51: "BRUINE",
  53: "BRUINE",
  55: "BRUINE",
  61: "PLUIE",
  63: "PLUIE",
  65: "PLUIE FORTE",
  71: "NEIGE",
  73: "NEIGE",
  75: "NEIGE FORTE",
  80: "AVERSES",
  81: "AVERSES",
  82: "AVERSES",
  95: "ORAGE",
  96: "ORAGE GRÊLE",
  99: "ORAGE GRÊLE",
};

interface QueryContext {
  type: string;
  tag: string;
  detail?: string;
}

function detectContext(messages: ChatMessage[]): QueryContext {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { type: "STANDBY", tag: "›  AWAITING_INPUT" };
  const t = lastUser.content.toLowerCase().trim();
  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;
  if (/carte|trouve|près|proche|autour|adresse|itinéraire|où.*est|où.*se trouve/.test(t))
    return { type: "GEO_QUERY", tag: "◎  CARTOGRAPHIE", detail: truncate(t, 40) };
  if (/calcule|combien|résous|formule|équation|intégrale|dérivée|matrice|\d+\s*[+\-*/]\s*\d+/.test(t))
    return { type: "MATH_OP", tag: "∑  CALCUL", detail: truncate(t, 40) };
  if (/cherche|recherche|qui est|c'est quoi|qu'est-ce|news|actualité|dernière/.test(t))
    return { type: "WEB_LOOKUP", tag: "⌕  RECHERCHE", detail: truncate(t, 40) };
  if (/code|fonction|debug|programme|algo|api|sql|json|typescript|python|react/.test(t))
    return { type: "ENGINEERING", tag: "{ }  CODE", detail: truncate(t, 40) };
  if (/explique|comment|pourquoi|qu'est-ce qui|raison/.test(t))
    return { type: "REASONING", tag: "?  ANALYSE", detail: truncate(t, 40) };
  if (/qcm|exercice|fiche|révision|cours/.test(t))
    return { type: "EDUCATION", tag: "▤  PÉDAGOGIE", detail: truncate(t, 40) };
  return { type: "GENERAL", tag: "›  CONVERSATION", detail: truncate(t, 40) };
}

// Estimation grossière des tokens (≈ 4 chars / token pour le français/anglais)
function estimateTokens(messages: ChatMessage[]) {
  return messages.reduce(
    (acc, m) => acc + Math.ceil((m.content?.length ?? 0) / 4),
    0,
  );
}

function formatUptime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ContextDock({
  userLocation,
  messages,
  activeTool,
  state,
  recording,
  ttsPlaying,
  pinsCount = 0,
  mapOpen,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(
    null,
  );
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(true);
  const [battery, setBattery] = useState<{
    level: number;
    charging: boolean;
  } | null>(null);
  const sessionStartRef = useRef<number>(Date.now());

  // Horloge temps réel
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tick pour les animations neural
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 10000), 250);
    return () => clearInterval(id);
  }, []);

  // Online/offline
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Battery API (Chromium uniquement, gracefully ignored ailleurs)
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const navAny = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (e: string, fn: () => void) => void;
        removeEventListener: (e: string, fn: () => void) => void;
      }>;
    };
    if (!navAny.getBattery) return;
    let battObj: Awaited<ReturnType<NonNullable<typeof navAny.getBattery>>> | null = null;
    let cancelled = false;
    const update = () => {
      if (battObj && !cancelled) {
        setBattery({ level: battObj.level, charging: battObj.charging });
      }
    };
    navAny.getBattery().then((b) => {
      if (cancelled) return;
      battObj = b;
      update();
      b.addEventListener("levelchange", update);
      b.addEventListener("chargingchange", update);
    });
    return () => {
      cancelled = true;
      if (battObj) {
        battObj.removeEventListener("levelchange", update);
        battObj.removeEventListener("chargingchange", update);
      }
    };
  }, []);

  // Météo Open-Meteo (gratuit), refresh toutes les 10 min
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${userLocation.lat}&longitude=${userLocation.lng}&current_weather=true`,
        );
        const data = await res.json();
        if (!cancelled && data?.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode,
          });
        }
      } catch {
        /* silent */
      }
    };
    void fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userLocation]);

  const context = useMemo(() => detectContext(messages), [messages]);
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  const assistantMsgCount = messages.filter(
    (m) => m.role === "assistant" && m.content,
  ).length;
  const tokenCount = useMemo(() => estimateTokens(messages), [messages]);
  const uptimeSec = Math.floor((Date.now() - sessionStartRef.current) / 1000);

  const time = now.toLocaleTimeString("fr-FR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now
    .toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();

  const isActive = state === "thinking" || state === "speaking";
  const neuralBars = useMemo(() => {
    return Array.from({ length: 16 }, (_, i) => {
      const base = 0.25 + Math.sin(tick * 0.18 + i * 0.5) * 0.18;
      const boost = isActive ? 0.35 + Math.random() * 0.4 : 0.1;
      return Math.min(1, base + boost);
    });
  }, [tick, isActive]);

  return (
    <>
      {/* Groupe GAUCHE — 2 cartes côte à côte (horizontal) */}
      <div
        className="hidden lg:flex pointer-events-none absolute left-4 xl:left-6 bottom-4 xl:bottom-6 z-10 flex-row gap-2 hologram-flicker"
        aria-hidden
      >
        <Card title="ENV" status={userLocation ? "LOCK" : "—"}>
          <Row label="HEURE" value={time} mono />
          <Row label="DATE" value={date} mono />
          {weather && (
            <Row
              label="MÉTÉO"
              value={`${weather.temp}°  ${WEATHER_LABEL[weather.code] ?? "—"}`}
              mono
            />
          )}
          {userLocation && (
            <Row
              label="GPS"
              value={`${userLocation.lat.toFixed(2)},${userLocation.lng.toFixed(2)}`}
              mono
            />
          )}
        </Card>

        <Card title="SYSTEM" status={online ? "ONLINE" : "OFFLINE"}>
          <StatusPill
            label="MIC"
            on={!!recording}
            onColor="#ff3b6c"
            offLabel="OFF"
            onLabel="REC"
          />
          <StatusPill
            label="VOX"
            on={!!ttsPlaying}
            onLabel="OUT"
            offLabel="OFF"
          />
          <StatusPill label="NET" on={online} onLabel="UP" offLabel="DOWN" />
          {battery ? (
            <StatusPill
              label="BAT"
              on={battery.charging}
              onLabel={`${Math.round(battery.level * 100)}%⚡`}
              offLabel={`${Math.round(battery.level * 100)}%`}
            />
          ) : (
            <StatusPill label="BAT" on={false} offLabel="N/A" />
          )}
        </Card>
      </div>

      {/* Groupe DROITE — 2 cartes côte à côte. Positionnées au-dessus du
          chat input (bottom-32) pour éviter le chevauchement. */}
      <div
        className="hidden lg:flex pointer-events-none absolute right-4 xl:right-6 bottom-32 xl:bottom-36 z-10 flex-row gap-2 hologram-flicker"
        aria-hidden
      >
        <Card
          title="CONTEXT"
          status={
            activeTool ? "TOOL" : state === "thinking" ? "ACTIVE" : "READY"
          }
        >
          <div className="font-display tracking-[0.18em] text-[10px] text-jarvis-cyan/90">
            {context.tag}
          </div>
          {context.detail && (
            <div className="font-mono text-[8px] text-jarvis-muted/70 leading-snug">
              "{context.detail}"
            </div>
          )}
          {mapOpen && pinsCount > 0 && (
            <Row label="PINS" value={String(pinsCount).padStart(2, "0")} mono />
          )}
          {activeTool && (
            <Row label="TOOL" value={activeTool.name.toUpperCase().slice(0, 12)} mono />
          )}
        </Card>

        <Card title="NEURAL" status={isActive ? "PROC" : "IDLE"}>
          <div className="flex items-end gap-[1.5px] h-7">
            {neuralBars.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-[height] duration-200"
                style={{
                  height: `${v * 100}%`,
                  background:
                    "linear-gradient(180deg, rgba(103,232,249,0.85) 0%, rgba(0,212,255,0.6) 100%)",
                }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-2">
            <Row label="REQ" value={String(userMsgCount).padStart(2, "0")} mono />
            <Row label="UP" value={formatUptime(uptimeSec)} mono />
            <Row label="RES" value={String(assistantMsgCount).padStart(2, "0")} mono />
            <Row label="TOK" value={`~${tokenCount}`} mono />
          </div>
        </Card>
      </div>
    </>
  );
}

function Card({
  title,
  status,
  children,
}: {
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md px-2.5 py-2 flex flex-col gap-1 w-[160px] xl:w-[180px]"
      style={{
        background: "rgba(7, 13, 26, 0.28)",
        border: "1px solid rgba(103, 232, 249, 0.08)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <div className="flex items-center justify-between pb-1 border-b border-jarvis-cyan/8">
        <div className="flex items-center gap-1.5">
          <div className="h-[3px] w-[3px] rounded-full bg-jarvis-cyan/70" />
          <span className="font-display text-[8px] tracking-[0.4em] text-jarvis-cyan/55">
            {title}
          </span>
        </div>
        {status && (
          <span className="font-mono text-[7px] tracking-widest text-jarvis-muted/60">
            {status}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[7px] tracking-[0.25em] text-jarvis-muted/55">
        {label}
      </span>
      <span
        className={`text-[9px] text-jarvis-cyan/80 tabular-nums ${
          mono ? "font-mono" : "font-display tracking-wider"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  label,
  on,
  onLabel = "ON",
  offLabel = "OFF",
  onColor = "#67e8f9",
}: {
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  onColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <div className="flex items-center gap-1.5">
        <div
          className={`h-[5px] w-[5px] rounded-full ${on ? "animate-pulse" : ""}`}
          style={{
            background: on ? onColor : "rgba(122,144,184,0.25)",
          }}
        />
        <span className="font-mono text-[7px] tracking-[0.3em] text-jarvis-muted/60">
          {label}
        </span>
      </div>
      <span
        className="font-mono text-[8px] tabular-nums tracking-wider"
        style={{ color: on ? `${onColor}cc` : "rgba(122,144,184,0.5)" }}
      >
        {on ? onLabel : offLabel}
      </span>
    </div>
  );
}
