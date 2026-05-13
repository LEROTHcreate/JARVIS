"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MaplibreMap,
  type Marker,
  LngLatBounds,
} from "maplibre-gl";
// CSS MapLibre est importé globalement dans app/globals.css pour éviter
// les soucis de bundling Next.js sur les side-effect imports en client component.
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MapPin, UserLocation } from "@/types";

// Durée totale du zoom spatial (plus c'est long, plus c'est dramatique)
const SPATIAL_ZOOM_DURATION_MS = 7000;
// zoom 0 = globe entier fits viewport ; au-dessus de 1 le globe est plus
// petit que la viewport, on perd l'effet "Terre vue de l'espace".
const SPATIAL_INITIAL_ZOOM = 0;
const SPATIAL_HOLD_MS = 500; // pause sur la vue spatiale avant de plonger

/**
 * Broche cyan JARVIS pour les POI — simple cercle plein avec bordure
 * blanche et glow cyan. Rendu via HTML Marker.
 */
function createPinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #00d4ff;
    border: 3px solid #ffffff;
    box-sizing: border-box;
    box-shadow:
      0 0 0 2px rgba(0, 212, 255, 0.6),
      0 0 14px rgba(0, 212, 255, 1),
      0 0 36px rgba(0, 212, 255, 0.55);
    cursor: pointer;
    pointer-events: auto;
  `;
  return el;
}

/**
 * Marker utilisateur — "target lock" JARVIS : crosshair rotatif + cœur
 * blanc pulsant + halo cyan. Distinct des broches POI.
 */
function createUserElement(): HTMLDivElement {
  // Keyframes spécifiques au marker user (une seule fois pour le module)
  if (!document.getElementById("jarvis-user-kf")) {
    const style = document.createElement("style");
    style.id = "jarvis-user-kf";
    style.textContent = `
      @keyframes jarvis-user-core { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
      @keyframes jarvis-user-halo { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }
      @keyframes jarvis-user-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  const root = document.createElement("div");
  root.style.cssText = `
    position: relative;
    width: 42px; height: 42px;
    pointer-events: auto;
    cursor: pointer;
  `;

  // Halo qui scanne en boucle
  const halo = document.createElement("div");
  halo.style.cssText = `
    position: absolute; inset: 0;
    border-radius: 9999px;
    background: radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(0,212,255,0.18) 50%, transparent 80%);
    animation: jarvis-user-halo 2.5s ease-out infinite;
    pointer-events: none;
  `;
  root.appendChild(halo);

  // Cadre crosshair rotatif (4 tirets cardinaux)
  const cross = document.createElement("div");
  cross.style.cssText = `
    position: absolute;
    top: 50%; left: 50%;
    width: 36px; height: 36px;
    margin-left: -18px; margin-top: -18px;
    animation: jarvis-user-spin 8s linear infinite;
    pointer-events: none;
  `;
  // 4 petits tirets cyan aux 4 cardinaux
  for (const t of [
    { top: "0", left: "50%", w: "2px", h: "8px", ml: "-1px" },
    { top: "50%", right: "0", w: "8px", h: "2px", mt: "-1px" },
    { bottom: "0", left: "50%", w: "2px", h: "8px", ml: "-1px" },
    { top: "50%", left: "0", w: "8px", h: "2px", mt: "-1px" },
  ] as const) {
    const tick = document.createElement("div");
    tick.style.cssText = `
      position: absolute;
      ${"top" in t && t.top ? `top:${t.top};` : ""}
      ${"bottom" in t && t.bottom ? `bottom:${t.bottom};` : ""}
      ${"left" in t && t.left ? `left:${t.left};` : ""}
      ${"right" in t && t.right ? `right:${t.right};` : ""}
      width: ${t.w}; height: ${t.h};
      ${"ml" in t && t.ml ? `margin-left:${t.ml};` : ""}
      ${"mt" in t && t.mt ? `margin-top:${t.mt};` : ""}
      background: #00d4ff;
      box-shadow: 0 0 6px #00d4ff;
    `;
    cross.appendChild(tick);
  }
  root.appendChild(cross);

  // Cœur blanc pulsant entouré d'un anneau cyan
  const core = document.createElement("div");
  core.style.cssText = `
    position: absolute;
    top: 50%; left: 50%;
    width: 14px; height: 14px;
    margin-left: -7px; margin-top: -7px;
    border-radius: 9999px;
    background: #ffffff;
    border: 2px solid #00d4ff;
    box-shadow:
      0 0 8px rgba(255,255,255,1),
      0 0 16px rgba(103,232,249,0.9),
      0 0 32px rgba(0,212,255,0.7);
    animation: jarvis-user-core 2s ease-in-out infinite;
  `;
  root.appendChild(core);

  return root;
}

/**
 * Overlay HUD affiché pendant le zoom spatial : réticule cible animé +
 * lignes télémétriques + coordonnées qui se "verrouillent" progressivement.
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
          <div className="relative h-[260px] w-[260px]">
            <motion.div
              className="absolute inset-0 rounded-full border border-jarvis-cyan/60"
              animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              style={{ boxShadow: "0 0 24px rgba(0,212,255,0.35)" }}
            />
            <div className="absolute inset-12 rounded-full border border-dashed border-jarvis-cyan/40" />
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

          <div className="absolute bottom-32 sm:bottom-36 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div className="font-display tracking-[0.45em] text-xs text-jarvis-cyan glow-text-soft">
              ACQUISITION DE CIBLE
            </div>
            <div className="font-mono text-[11px] text-jarvis-muted tracking-widest tabular-nums">
              LAT {lat}  ·  LNG {lng}
            </div>
          </div>

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const poiMarkersRef = useRef<Marker[]>([]);
  const playedRef = useRef<string>("");
  const [zooming, setZooming] = useState(false);

  const target =
    userLocation ?? (pins.length ? { lat: pins[0].lat, lng: pins[0].lng } : null);

  // 1) Init MapLibre globe — une seule fois au montage du composant.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      console.error(
        "[MapPanel] NEXT_PUBLIC_MAPTILER_KEY manquante — la map ne sera pas initialisée.",
      );
      return;
    }

    const initialCenter: [number, number] = target
      ? [target.lng, target.lat]
      : [0, 20];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-dark/style.json?key=${key}`,
      center: initialCenter,
      zoom: SPATIAL_INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      maxZoom: 19,
      attributionControl: false,
    });

    mapRef.current = map;

    const c = containerRef.current;
    console.log("[MapPanel] init MapLibre map créée — container", {
      offsetWidth: c.offsetWidth,
      offsetHeight: c.offsetHeight,
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
      computedDisplay: window.getComputedStyle(c).display,
      computedPosition: window.getComputedStyle(c).position,
    });

    map.on("error", (e) => {
      console.error("[MapPanel] erreur MapLibre :", e?.error?.message ?? e);
    });

    map.on("load", () => {
      const canvas = c.querySelector("canvas");
      console.log(
        "[MapPanel] style chargé — applique globe + sky · canvas =",
        canvas
          ? {
              width: canvas.width,
              height: canvas.height,
              styleWidth: canvas.style.width,
              styleHeight: canvas.style.height,
              visible: canvas.offsetWidth > 0 && canvas.offsetHeight > 0,
            }
          : "AUCUN canvas créé",
      );
      // Active la projection globe APRÈS le load (plus sûr qu'en config init,
      // certains styles MapTiler forcent mercator au démarrage).
      try {
        map.setProjection({ type: "globe" });
      } catch (e) {
        console.warn("[MapPanel] setProjection(globe) échoué :", e);
      }
      try {
        map.setSky({
          "sky-color": "#03060d",
          "horizon-color": "#0a84ff",
          "fog-color": "#03060d",
          "sky-horizon-blend": 0.5,
          "horizon-fog-blend": 0.6,
          "fog-ground-blend": 0.3,
          "atmosphere-blend": 1,
        });
      } catch (e) {
        console.warn("[MapPanel] setSky non supporté :", e);
      }
    });

    // Cleanup au démontage
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Resize handler (au cas où le viewport change pendant l'affichage)
  useEffect(() => {
    if (!mapRef.current) return;
    const onResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 3) Plonge cinématique : globe → bounds des pins, dès que pins/userLocation
  //    changent. Joue une seule fois par set unique.
  useEffect(() => {
    const map = mapRef.current;
    console.log("[MapPanel] zoom useEffect entry — map:", !!map, "target:", target, "pins:", pins.length);
    if (!map || !target) return;

    const key = JSON.stringify({
      u: userLocation,
      p: pins.map((p) => [p.lat, p.lng]),
    });
    console.log("[MapPanel] zoom useEffect — key:", key.slice(0, 80), "playedRef:", playedRef.current.slice(0, 80));
    if (playedRef.current === key) {
      console.log("[MapPanel] zoom useEffect — SKIP (key déjà jouée)");
      return;
    }
    playedRef.current = key;

    // Garde-fous contre les double-mounts (React StrictMode) et les
    // démontages pendant les setTimeout : on utilise toujours mapRef.current
    // (qui devient null après cleanup) au lieu de la closure `map` qui
    // pointe vers une instance potentiellement détruite.
    let cancelled = false;
    let hasPlayed = false; // true dès que playAfterLoad a démarré
    const timers: ReturnType<typeof setTimeout>[] = [];

    const playAfterLoad = () => {
      console.log("[MapPanel] playAfterLoad START — cancelled:", cancelled, "mapRef:", !!mapRef.current);
      if (cancelled) return;
      hasPlayed = true;
      const m = mapRef.current;
      if (!m) return;

      // 0. Projection globe forcée avant le zoom
      try {
        m.setProjection({ type: "globe" });
        console.log("[MapPanel] playAfterLoad — setProjection(globe) OK");
      } catch (e) {
        console.warn("[MapPanel] playAfterLoad — setProjection FAIL:", e);
      }

      // 1. Vue spatiale figée sur la cible
      console.log("[MapPanel] playAfterLoad — jumpTo zoom 0 sur", target);
      m.jumpTo({
        center: [target.lng, target.lat],
        zoom: SPATIAL_INITIAL_ZOOM,
        pitch: 0,
        bearing: 0,
      });
      setZooming(true);

      // 2. Petite pause sur l'espace
      const tHold = setTimeout(() => {
        console.log("[MapPanel] tHold timer fire — cancelled:", cancelled, "mapRef:", !!mapRef.current);
        if (cancelled) return;
        const m2 = mapRef.current;
        if (!m2) return;

        // 3. Calcule les bounds incluant tous les pins + user
        const allPoints: Array<[number, number]> = [
          [target.lng, target.lat],
          ...pins.map((p) => [p.lng, p.lat] as [number, number]),
        ];
        const bounds = new LngLatBounds(allPoints[0], allPoints[0]);
        for (const pt of allPoints.slice(1)) bounds.extend(pt);

        // Padding plus large + maxZoom plus bas → on s'arrête sur une vue
        // quartier où on voit TOUS les pins ensemble avec du contexte
        // autour, au lieu de coller au sol au point central.
        // On garde la projection GLOBE pendant tout le flyTo pour que la
        // cinématique parte vraiment de la vue spatiale (zoom 0 globe) et
        // plonge progressivement vers la surface. Le switch en mercator
        // se fait à la fin de l'anim, dans tEnd, une fois posé au sol.

        const cam = m2.cameraForBounds(bounds, {
          padding: 180,
          maxZoom: 14,
          pitch: 40,
        });
        console.log("[MapPanel] cameraForBounds →", cam);

        if (cam) {
          console.log("[MapPanel] flyTo avec cam:", cam);
          m2.flyTo({
            center: cam.center,
            zoom: cam.zoom,
            pitch: 40,
            bearing: 0,
            duration: SPATIAL_ZOOM_DURATION_MS,
            curve: 1.42,
            essential: true,
          });
        } else {
          console.log("[MapPanel] flyTo fallback (zoom 13)");
          m2.flyTo({
            center: [target.lng, target.lat],
            zoom: 13,
            pitch: 40,
            duration: SPATIAL_ZOOM_DURATION_MS,
            curve: 1.42,
            essential: true,
          });
        }

        const tEnd = setTimeout(() => {
          if (cancelled) return;
          setZooming(false);
          // === DIAGNOSTIC === position des markers POI APRÈS la cinématique
          const allMarkers = document.querySelectorAll(
            ".maplibregl-marker",
          );
          console.log(
            "[MapPanel/diag] === FIN CINÉMATIQUE === DOM .maplibregl-marker =",
            allMarkers.length,
          );
          allMarkers.forEach((el, i) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            const tr = (el as HTMLElement).style.transform;
            console.log(
              `[MapPanel/diag] post-fly marker[${i}] rect=`,
              {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              },
              "· transform=",
              tr,
              "· inViewport=",
              rect.x >= 0 &&
                rect.y >= 0 &&
                rect.x < window.innerWidth &&
                rect.y < window.innerHeight,
            );
          });
          // Fin de la plongée cinématique :
          //  1. bascule en projection mercator (carte plate 2D)
          //  2. easeTo pour redresser le pitch à 0 — vue top-down, les pins
          //     marquent exactement le point GPS au sol, plus d'effet
          //     parallaxe perçu quand l'user pan.
          // Bascule globe → mercator à la fin de la cinématique pour
          // que les markers soient parfaitement stables une fois posé.
          try {
            m2.setProjection({ type: "mercator" });
          } catch (e) {
            console.warn(
              "[MapPanel] setProjection(mercator) post-flyTo échoué :",
              e,
            );
          }
          m2.easeTo({
            pitch: 0,
            bearing: 0,
            duration: 1000,
            essential: true,
          });
        }, SPATIAL_ZOOM_DURATION_MS + 200);
        timers.push(tEnd);
      }, SPATIAL_HOLD_MS);
      timers.push(tHold);
    };

    // Si le style est déjà chargé : on joue immédiatement.
    // Sinon : on attache un listener `load`. On garde une ref vers le
    // listener pour pouvoir le retirer au cleanup si nécessaire.
    console.log("[MapPanel] zoom useEffect — isStyleLoaded:", map.isStyleLoaded());
    if (map.isStyleLoaded()) {
      playAfterLoad();
    } else {
      console.log("[MapPanel] zoom useEffect — attend l'event 'load'");
      map.once("load", playAfterLoad);
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      try {
        map.off("load", playAfterLoad);
      } catch {
        /* no-op */
      }
      // CRITIQUE pour StrictMode : si l'animation n'a jamais démarré
      // (cleanup avant que `load` ne fire), on doit reset playedRef
      // pour que le 2e mount puisse relancer l'animation. Sans ça,
      // playedRef garde la clé et le 2e useEffect SKIP → animation perdue.
      if (!hasPlayed) {
        playedRef.current = "";
        console.log("[MapPanel] cleanup — animation pas jouée, reset playedRef");
      }
    };
    // IMPORTANT : `target` est volontairement EXCLU du dep array car il
    // est recalculé à chaque render (nouvel objet) → le useEffect re-tirait
    // en boucle, cleanait le 1er run (cancelled=true + off("load")) et
    // skipait le 2e (playedRef déjà set) → animation jamais jouée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, userLocation]);

  // 4a) User marker (HTML, position avec crosshair animé). Pas de souci de
  //     dérive : il est unique et bien câblé.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Wipe old user markers seulement
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (userLocation) {
      const m = new maplibregl.Marker({
        element: createUserElement(),
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
            `<div style="font-family:'Rajdhani',sans-serif;padding:4px 6px;color:#03060d;"><strong>Position actuelle</strong></div>`,
          ),
        )
        .addTo(map);
      markersRef.current.push(m);
    }
  }, [userLocation]);

  // 4b) Pins POI rendus en HTML markers cyan. Ajoutés DÈS que les pins
  //     arrivent (plus de gating sur cinematicDone qui pouvait sauter en
  //     StrictMode / re-render). Les markers sont ancrés à la projection
  //     MapLibre donc ils restent collés à leur coordonnée GPS pendant tout
  //     le flyTo, c'est juste leur taille apparente qui change avec le zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      console.log("[MapPanel] sync POI markers — map null, skip");
      return;
    }

    // Wipe les anciens POI markers à chaque resync
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    // === DIAGNOSTIC === forme exacte de la donnée pins reçue
    console.log(
      "[MapPanel/diag] pins reçus :",
      pins.length,
      "· sample[0] =",
      pins[0],
      "· typeof lng/lat =",
      pins[0] ? typeof pins[0].lng : "n/a",
      "/",
      pins[0] ? typeof pins[0].lat : "n/a",
    );

    console.log(
      "[MapPanel] sync POI markers — pins :",
      pins.length,
      pins.length > 0 ? pins.map((p) => `${p.name} @ ${p.lng},${p.lat}`) : "",
    );

    if (pins.length === 0) return;

    const addMarkers = () => {
      const m = mapRef.current;
      if (!m) {
        console.warn("[MapPanel] addMarkers : mapRef null, abort");
        return;
      }
      // === DIAGNOSTIC === la map utilisée est-elle bien la même qu'au register ?
      console.log(
        "[MapPanel/diag] addMarkers fire — mapRef===closureMap ?",
        m === map,
        "· isStyleLoaded =",
        m.isStyleLoaded(),
        "· container.isConnected =",
        m.getContainer().isConnected,
      );
      pins.forEach((p, idx) => {
        const marker = new maplibregl.Marker({
          element: createPinElement(),
          anchor: "center",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
              `<div style="font-family:'Rajdhani',sans-serif;padding:4px 6px;color:#03060d;">
                <strong>${escapeHtml(p.name)}</strong>
                ${p.description ? `<div style="margin-top:4px;font-size:12px;opacity:0.78;">${escapeHtml(p.description)}</div>` : ""}
              </div>`,
            ),
          )
          .addTo(m);
        poiMarkersRef.current.push(marker);

        // === DIAGNOSTIC === état réel du marker juste après attachement
        const el = marker.getElement();
        const rect = el.getBoundingClientRect();
        const ll = marker.getLngLat();
        console.log(
          `[MapPanel/diag] marker[${idx}] "${p.name}" → getLngLat=`,
          { lng: ll.lng, lat: ll.lat },
          "· isConnected=",
          el.isConnected,
          "· rect=",
          {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          "· parent=",
          el.parentElement?.className ?? "(no parent)",
          "· computed display=",
          window.getComputedStyle(el).display,
          "· computed visibility=",
          window.getComputedStyle(el).visibility,
          "· computed opacity=",
          window.getComputedStyle(el).opacity,
        );
      });
      console.log(
        "[MapPanel] POI markers ajoutés ✓ — total =",
        poiMarkersRef.current.length,
        "· DOM count .maplibregl-marker =",
        document.querySelectorAll(".maplibregl-marker").length,
      );
    };

    // Wrapping qui re-lit mapRef.current à chaque tick : si StrictMode a
    // démonté/remonté entre le register et le firing de "load", on
    // s'assure d'attacher les markers à la map CURRENT, pas à celle
    // capturée dans la closure.
    const waitAndAdd = () => {
      const current = mapRef.current;
      if (!current) {
        console.warn("[MapPanel/diag] waitAndAdd : mapRef null à l'exec");
        return;
      }
      if (current.isStyleLoaded()) {
        addMarkers();
      } else {
        console.log(
          "[MapPanel/diag] waitAndAdd : style pas prêt → once('load') sur",
          current === map ? "même map" : "MAP DIFFÉRENTE de la closure",
        );
        current.once("load", () => {
          if (mapRef.current === current) {
            addMarkers();
          } else {
            console.warn(
              "[MapPanel/diag] load fire mais mapRef a changé → abort",
            );
          }
        });
      }
    };

    waitAndAdd();
  }, [pins]);

  return (
    <div className="absolute inset-0">
      {/* Conteneur MapLibre */}
      <div ref={containerRef} className="absolute inset-0" />

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
        durationMs={SPATIAL_ZOOM_DURATION_MS + SPATIAL_HOLD_MS}
      />

      {/* Bouton fermer — fixed + z très haut pour passer au-dessus de tous
          les overlays HUD (Crosshair, TopRightInfo, ZoomHud, etc.) */}
      <button
        onClick={onClose}
        type="button"
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        className="fixed top-4 right-4 z-[9999] h-10 w-10 grid place-items-center rounded-lg bg-black/80 backdrop-blur text-jarvis-cyan border border-jarvis-cyan/50 hover:bg-jarvis-cyan/20 transition"
        aria-label="Fermer la carte"
      >
        <X size={16} />
      </button>

    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
