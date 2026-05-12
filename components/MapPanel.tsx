"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MapPin, UserLocation } from "@/types";

// Durée totale du zoom spatial (plus c'est long, plus c'est dramatique)
const SPATIAL_ZOOM_DURATION = 6.5;
const SPATIAL_INITIAL_ZOOM = 2; // niveau "globe complet"
const SPATIAL_HOLD_MS = 600; // pause sur la vue spatiale avant de plonger

const PinIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:18px;height:18px;border-radius:9999px;
    background:radial-gradient(circle,#00d4ff 0%, rgba(0,212,255,0.2) 70%, transparent 100%);
    box-shadow:0 0 12px rgba(0,212,255,0.9);
    border:2px solid #00d4ff;
  "></div>`,
  iconAnchor: [9, 9],
});

const UserIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:14px;height:14px;border-radius:9999px;
    background:#fff;
    box-shadow:0 0 16px rgba(255,255,255,0.95), 0 0 32px rgba(0,212,255,0.7);
    border:2px solid #00d4ff;
    animation: jarvis-user-pulse 2s ease-in-out infinite;
  "></div>
  <style>@keyframes jarvis-user-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}</style>`,
  iconAnchor: [7, 7],
});

/**
 * Anime la carte depuis une "vue spatiale" (zoom monde) vers la position
 * de l'utilisateur et les broches, comme une plongée depuis l'orbite.
 * Notifie le parent au début et à la fin pour synchroniser l'overlay HUD.
 */
function SpatialZoom({
  pins,
  userLocation,
  onZoomStart,
  onZoomEnd,
}: {
  pins: MapPin[];
  userLocation?: UserLocation;
  onZoomStart?: () => void;
  onZoomEnd?: () => void;
}) {
  const map = useMap();
  const playedRef = useRef<string>("");

  useEffect(() => {
    const target =
      userLocation ?? (pins.length ? { lat: pins[0].lat, lng: pins[0].lng } : null);
    if (!target) return;

    // Clé unique pour ne pas rejouer l'anim sur le même set
    const key = JSON.stringify({ u: userLocation, p: pins.map((p) => [p.lat, p.lng]) });
    if (playedRef.current === key) return;
    playedRef.current = key;

    onZoomStart?.();

    // 1) Vue spatiale : on se positionne très loin, vue globe.
    //    On centre déjà sur la cible pour que le zoom soit "droit dessus".
    map.setView([target.lat, target.lng], SPATIAL_INITIAL_ZOOM, {
      animate: false,
    });

    // 2) Petite pause pour qu'on perçoive la vue spatiale...
    const t = setTimeout(() => {
      // 3) ...puis plongée. easeLinearity faible = courbe très accélérée
      //    au début, ralentit fortement à l'arrivée (effet "freinage atmo").
      if (pins.length > 0) {
        const bounds = L.latLngBounds([
          [target.lat, target.lng],
          ...pins.map((p) => [p.lat, p.lng] as [number, number]),
        ]);
        map.flyToBounds(bounds, {
          padding: [140, 140],
          duration: SPATIAL_ZOOM_DURATION,
          easeLinearity: 0.12,
          maxZoom: 16,
        });
      } else {
        map.flyTo([target.lat, target.lng], 15, {
          duration: SPATIAL_ZOOM_DURATION,
          easeLinearity: 0.12,
        });
      }

      const end = setTimeout(
        () => onZoomEnd?.(),
        SPATIAL_ZOOM_DURATION * 1000 + 100,
      );
      return () => clearTimeout(end);
    }, SPATIAL_HOLD_MS);

    return () => clearTimeout(t);
  }, [pins, userLocation, map, onZoomStart, onZoomEnd]);

  return null;
}

/**
 * Overlay HUD affiché pendant le zoom spatial : réticule cible animé +
 * lignes télémétriques + coordonnées qui se "verrouillent" progressivement.
 * Donne l'impression que JARVIS acquiert la cible depuis l'espace.
 */
function ZoomHud({
  visible,
  target,
  durationMs,
}: {
  visible: boolean;
  target: { lat: number; lng: number } | null;
  durationMs: number;
}) {
  // Faux flux de coordonnées qui se précise vers la valeur réelle
  const [lat, setLat] = useState("--.------");
  const [lng, setLng] = useState("--.------");

  useEffect(() => {
    if (!visible || !target) {
      setLat("--.------");
      setLng("--.------");
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      // Easing : précision arrive surtout à la fin
      const precision = Math.pow(t, 3);
      const noise = (1 - precision) * (Math.random() - 0.5) * 8;
      setLat((target.lat + noise).toFixed(6));
      setLng((target.lng + noise * 1.3).toFixed(6));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [visible, target, durationMs]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[1001] pointer-events-none grid place-items-center"
        >
          {/* Réticule central */}
          <div className="relative h-[260px] w-[260px]">
            {/* Cercle externe pulsant */}
            <motion.div
              className="absolute inset-0 rounded-full border border-jarvis-cyan/60"
              animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ boxShadow: "0 0 24px rgba(0,212,255,0.35)" }}
            />
            {/* Cercle interne pointillé */}
            <div
              className="absolute inset-12 rounded-full border border-dashed border-jarvis-cyan/40"
            />
            {/* Croix centrale */}
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative">
                <div
                  className="absolute h-[1px] w-12 bg-jarvis-cyan"
                  style={{
                    left: "-24px",
                    top: 0,
                    boxShadow: "0 0 6px #00d4ff",
                  }}
                />
                <div
                  className="absolute w-[1px] h-12 bg-jarvis-cyan"
                  style={{
                    top: "-24px",
                    left: 0,
                    boxShadow: "0 0 6px #00d4ff",
                  }}
                />
                <div className="h-1.5 w-1.5 rounded-full bg-jarvis-cyan" />
              </div>
            </div>
            {/* Coins de cadre */}
            {[
              "top-0 left-0 border-t border-l",
              "top-0 right-0 border-t border-r",
              "bottom-0 left-0 border-b border-l",
              "bottom-0 right-0 border-b border-r",
            ].map((cls, i) => (
              <motion.div
                key={i}
                className={`absolute h-6 w-6 border-jarvis-cyan ${cls}`}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>

          {/* Bandeau bas : statut + coordonnées */}
          <div className="absolute bottom-32 sm:bottom-36 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div className="font-display tracking-[0.45em] text-xs text-jarvis-cyan glow-text-soft">
              ACQUISITION DE CIBLE
            </div>
            <div className="font-mono text-[11px] text-jarvis-muted tracking-widest tabular-nums">
              LAT {lat}  ·  LNG {lng}
            </div>
          </div>

          {/* Bandeau haut : status système */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 font-mono text-[10px] text-jarvis-cyan/80 tracking-[0.4em]">
            ›  ORBITAL_LOCK · DESCENDING
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface Props {
  pins: MapPin[];
  userLocation?: UserLocation;
  onClose: () => void;
}

export function MapPanel({ pins, userLocation, onClose }: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : pins.length
      ? [pins[0].lat, pins[0].lng]
      : [43.2965, 5.3698];

  const [zooming, setZooming] = useState(false);
  const target =
    userLocation ?? (pins.length ? { lat: pins[0].lat, lng: pins[0].lng } : null);

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={center}
        zoom={SPATIAL_INITIAL_ZOOM}
        minZoom={SPATIAL_INITIAL_ZOOM}
        maxZoom={19}
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#03060d" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <SpatialZoom
          pins={pins}
          userLocation={userLocation}
          onZoomStart={() => setZooming(true)}
          onZoomEnd={() => setZooming(false)}
        />
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={UserIcon}
          >
            <Popup>
              <div className="font-body">
                <strong>Position actuelle</strong>
              </div>
            </Popup>
          </Marker>
        )}
        {pins.map((p, i) => (
          <Marker key={`${p.lat}-${p.lng}-${i}`} position={[p.lat, p.lng]} icon={PinIcon}>
            <Popup>
              <div className="font-body">
                <strong>{p.name}</strong>
                {p.description && (
                  <div className="mt-1 text-sm opacity-80">{p.description}</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Vignette sombre par-dessus la carte, pour le feeling spatial */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(3,6,13,0.85) 100%)",
        }}
      />

      {/* HUD d'acquisition pendant la plongée depuis l'espace */}
      <ZoomHud
        visible={zooming}
        target={target}
        durationMs={SPATIAL_ZOOM_DURATION * 1000 + SPATIAL_HOLD_MS}
      />

      {/* Bouton fermer */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[1000] h-10 w-10 grid place-items-center rounded-lg bg-black/70 backdrop-blur text-jarvis-cyan border border-jarvis-cyan/40 hover:bg-jarvis-cyan/20 transition"
        aria-label="Fermer la carte"
      >
        <X size={16} />
      </button>

      {/* Liste compacte des pins en bas-gauche */}
      {pins.length > 0 && (
        <div className="absolute bottom-24 sm:bottom-28 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-sm z-[1000] glass-panel rounded-xl px-4 py-3 max-h-48 overflow-y-auto thin-scroll">
          <div className="font-display tracking-[0.3em] text-[10px] text-jarvis-cyan mb-2">
            {pins.length} POINT{pins.length > 1 ? "S" : ""} TROUVÉ
            {pins.length > 1 ? "S" : ""}
          </div>
          <ul className="space-y-1.5">
            {pins.map((p, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-jarvis-cyan text-xs">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-body text-jarvis-text flex-1 truncate">
                  {p.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
