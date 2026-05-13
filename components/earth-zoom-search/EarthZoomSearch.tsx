"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type Marker } from "maplibre-gl";
import { toast } from "sonner";
import { Search, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMaplibre } from "./useMaplibre";
import { useFlyToSequence } from "./useFlyToSequence";
import {
  searchAddress,
  searchPOI,
  extractCityFromFeature,
} from "./geocoding";
import { isPOICategory, type LngLat } from "@/types/map";

/** Fallback proximity si la géoloc utilisateur est refusée — centre Marseille. */
const DEFAULT_PROXIMITY: LngLat = [5.3698, 43.2965];

export function EarthZoomSearch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<Marker | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { map, ready, setIdleRotation } = useMaplibre(containerRef);
  const { flyToDestination, flyToSpace } = useFlyToSequence(map);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);

  // Demande la géoloc au premier rendu — fallback sur Marseille en silence.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      () => {
        // Refus / indisponible : on garde DEFAULT_PROXIMITY
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const removeMarker = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !map || !ready || loading) return;

    // Annule une éventuelle recherche en cours
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setIdleRotation(false);
    removeMarker();

    try {
      const proximity = userLocation ?? DEFAULT_PROXIMITY;
      const poiCategory = isPOICategory(q);

      const feature = poiCategory
        ? await searchPOI(poiCategory, proximity, { signal: ctrl.signal })
        : await searchAddress(q, { proximity, signal: ctrl.signal });

      if (!feature) {
        toast.error("Aucun résultat", {
          description: `Pas de lieu trouvé pour "${q}".`,
        });
        return;
      }

      const destination = feature.center;
      const city = extractCityFromFeature(feature);

      await flyToDestination(destination, city?.center);

      // Marqueur final avec popup
      const popup = new maplibregl.Popup({
        offset: 24,
        closeButton: false,
        className: "earth-zoom-popup",
      }).setHTML(
        `<div style="font-family:'Rajdhani',sans-serif;color:#03060d;padding:4px 6px;">
          <strong>${escapeHtml(feature.text)}</strong><br/>
          <span style="font-size:11px;opacity:0.75;">${escapeHtml(feature.place_name)}</span>
        </div>`,
      );

      const marker = new maplibregl.Marker({
        color: "#00d4ff",
        anchor: "bottom",
      })
        .setLngLat(destination)
        .setPopup(popup)
        .addTo(map);
      marker.togglePopup();
      markerRef.current = marker;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message =
        err instanceof Error ? err.message : "Erreur de recherche";
      toast.error("Erreur", { description: message });
    } finally {
      setLoading(false);
    }
  }, [
    query,
    map,
    ready,
    loading,
    userLocation,
    setIdleRotation,
    flyToDestination,
    removeMarker,
  ]);

  const handleReset = useCallback(async () => {
    if (!map || loading) return;
    removeMarker();
    await flyToSpace();
    setIdleRotation(true);
    setQuery("");
  }, [map, loading, removeMarker, flyToSpace, setIdleRotation]);

  return (
    <div className="relative h-full w-full">
      {/* Canvas MapLibre — sa hauteur = parent */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Overlay barre de recherche (top center) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-[min(560px,92vw)]">
        <div className="glass-panel rounded-xl p-2 flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleSearch();
            }}
            placeholder='Adresse ou catégorie ("boulangerie", "opticien", "40 rue Saint-Sébastien Marseille"…)'
            disabled={loading}
            className={cn(
              "flex-1 min-w-0 bg-transparent outline-none px-3 h-10 text-jarvis-text",
              "placeholder:text-jarvis-muted/70 font-body text-[14px]",
              "disabled:opacity-50",
            )}
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || loading || !ready}
            className={cn(
              "h-10 px-3 sm:px-4 shrink-0 rounded-lg flex items-center gap-2 transition",
              "font-display tracking-widest text-xs",
              "bg-jarvis-cyan text-jarvis-bg hover:bg-jarvis-cyan/90",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            aria-label="Lancer la recherche"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            <span className="hidden sm:inline">CHERCHER</span>
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className={cn(
              "h-10 w-10 shrink-0 grid place-items-center rounded-lg transition",
              "bg-transparent border border-jarvis-cyan/30 text-jarvis-cyan",
              "hover:bg-jarvis-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            title="Retour vue spatiale"
            aria-label="Réinitialiser"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        {/* Info géoloc — petit indicateur en bas de la barre */}
        <div className="mt-2 text-center font-mono text-[10px] text-jarvis-muted tracking-widest">
          {userLocation
            ? `BIAIS DE PROXIMITÉ · ${userLocation[1].toFixed(3)}°N ${userLocation[0].toFixed(3)}°E`
            : "POSITION INCONNUE — RECHERCHE GLOBALE"}
        </div>
      </div>
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
