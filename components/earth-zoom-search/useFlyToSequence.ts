"use client";

import { useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FlyStep, LngLat } from "@/types/map";

/**
 * Hook qui exécute une séquence de `flyTo` MapLibre en chaîne, chaque
 * étape attendant `moveend` avant de lancer la suivante. Pitch progressif
 * pour effet d'immersion (vue orbitale → vue ville).
 *
 * Centres intermédiaires "naturels" :
 *  - Étape 1 : centre Europe ≈ [10, 50], zoom 3, pitch 15°
 *  - Étape 2 : centre France ≈ [2.5, 46.5], zoom 5.5, pitch 30°
 *  - Étape 3 : ville cible (extraite du context), zoom 11, pitch 45°
 *  - Étape 4 : adresse exacte, zoom 17, pitch 60°
 *
 * Le hook accepte aussi une séquence custom (`steps`) pour les cas où on
 * connaît déjà les coords intermédiaires (ex: depuis le context geocoding).
 */
export function useFlyToSequence(map: MaplibreMap | null) {
  /**
   * Attend la fin d'une animation flyTo via `moveend`. Si on est appelé
   * plusieurs fois sans interruption, on cleanup le listener précédent.
   */
  const waitMoveEnd = useCallback((map: MaplibreMap): Promise<void> => {
    return new Promise((resolve) => {
      const handler = () => {
        map.off("moveend", handler);
        resolve();
      };
      map.on("moveend", handler);
    });
  }, []);

  /**
   * Joue la séquence complète vers une destination donnée. Si `intermediateCity`
   * est fourni (résultat de reverseGeocode), on l'utilise comme étape 3,
   * sinon on déduit grossièrement depuis les coords de destination.
   */
  const flyToDestination = useCallback(
    async (
      destination: LngLat,
      intermediateCity?: LngLat,
    ): Promise<void> => {
      if (!map) return;

      // Étapes hardcodées Europe → France pour le scénario "user en France".
      // Si on veut généraliser à d'autres pays, on pourrait reverse-geocode
      // le pays + utiliser un dictionnaire de centres nationaux.
      const steps: FlyStep[] = [
        {
          center: [10, 50],
          zoom: 3.5,
          pitch: 15,
          duration: 2200,
        },
        {
          center: [2.5, 46.5],
          zoom: 5.5,
          pitch: 30,
          duration: 1800,
        },
        {
          center: intermediateCity ?? destination,
          zoom: 11,
          pitch: 45,
          duration: 1600,
        },
        {
          center: destination,
          zoom: 17,
          pitch: 60,
          bearing: 0,
          duration: 1400,
        },
      ];

      for (const step of steps) {
        map.flyTo({
          center: step.center,
          zoom: step.zoom,
          pitch: step.pitch,
          bearing: step.bearing ?? map.getBearing(),
          duration: step.duration ?? 1800,
          curve: 1.42, // ease-out cinématique
          essential: true, // ignore prefers-reduced-motion
        });
        await waitMoveEnd(map);
      }
    },
    [map, waitMoveEnd],
  );

  /**
   * Retour à la vue spatiale (zoom 1.2, pitch 0). Utilisé par le bouton
   * "Réinitialiser".
   */
  const flyToSpace = useCallback(async (): Promise<void> => {
    if (!map) return;
    map.flyTo({
      center: [0, 20],
      zoom: 1.2,
      pitch: 0,
      bearing: 0,
      duration: 2400,
      curve: 1.42,
      essential: true,
    });
    await waitMoveEnd(map);
  }, [map, waitMoveEnd]);

  return { flyToDestination, flyToSpace };
}
