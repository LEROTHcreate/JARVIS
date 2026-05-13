"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Hook qui initialise une instance MapLibre GL avec projection globe,
 * atmosphère/étoiles, et une rotation lente en mode idle. Tile provider :
 * MapTiler satellite. Cleanup auto au démontage.
 *
 * @param containerRef - ref vers le <div> conteneur de la map
 * @returns { map, ready, idleRotation } — `map` est null tant que `ready` n'est pas true
 */
export function useMaplibre(
  containerRef: React.RefObject<HTMLDivElement | null>,
): {
  map: MaplibreMap | null;
  ready: boolean;
  setIdleRotation: (enabled: boolean) => void;
} {
  const mapRef = useRef<MaplibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const idleRotationRef = useRef(true);
  const rotationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // déjà init, pas de re-création sur re-render

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      console.error(
        "[useMaplibre] NEXT_PUBLIC_MAPTILER_KEY manquante — la map ne sera pas initialisée.",
      );
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
      center: [0, 20],
      zoom: 1.2,
      pitch: 0,
      bearing: 0,
      maxZoom: 19,
      // Projection globe : la Terre est rendue en sphère, avec atmosphère
      // automatique sur les bords. Disponible en MapLibre v4+.
      // @ts-expect-error — `projection` accepté par MapLibre v5 mais
      // l'option directe en config n'est pas dans les types stables.
      projection: { type: "globe" },
      attributionControl: false,
      // Pas de UI native (zoom, compass) — on contrôle tout en code.
      antialias: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Atmosphère + étoiles via setSky (équivalent du setFog Mapbox).
      // L'API setSky est disponible en MapLibre v4+.
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
        console.warn("[useMaplibre] setSky non supporté :", e);
      }

      setReady(true);

      // Démarre la rotation idle. Se met en pause dès que l'utilisateur
      // interagit ou qu'on déclenche un flyTo (geré par setIdleRotation).
      const tick = () => {
        if (idleRotationRef.current && !map.isMoving()) {
          const center = map.getCenter();
          map.setCenter([center.lng + 0.05, center.lat]);
        }
        rotationFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    });

    return () => {
      if (rotationFrameRef.current !== null) {
        cancelAnimationFrame(rotationFrameRef.current);
        rotationFrameRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setIdleRotation = (enabled: boolean) => {
    idleRotationRef.current = enabled;
  };

  return { map: mapRef.current, ready, setIdleRotation };
}
