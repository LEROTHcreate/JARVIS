"use client";

import { useEffect, useRef } from "react";
import type { JarvisState } from "@/types";

interface Options {
  state: JarvisState;
  /** Contenu du dernier message assistant (utilisé comme body de la notif) */
  lastAssistantContent?: string;
  /** Désactive complètement les notifs */
  enabled?: boolean;
}

/**
 * Notification système quand JARVIS finit sa réponse pendant que l'onglet
 * est en arrière-plan. La permission est demandée à la première interaction
 * utilisateur (les browsers refusent un `requestPermission` au mount sans
 * geste).
 */
export function useDeskNotification({
  state,
  lastAssistantContent,
  enabled = true,
}: Options) {
  const prevStateRef = useRef<JarvisState>(state);
  const permissionAskedRef = useRef(false);

  // Demande la permission au PREMIER user gesture (click/key) — sinon
  // certains browsers ignorent la requête.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const ask = () => {
      if (permissionAskedRef.current) return;
      permissionAskedRef.current = true;
      try {
        void Notification.requestPermission();
      } catch {
        /* silencieux */
      }
    };
    window.addEventListener("click", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
    return () => {
      window.removeEventListener("click", ask);
      window.removeEventListener("keydown", ask);
    };
  }, [enabled]);

  // Détection : on était actif (thinking/speaking) → maintenant idle, et
  // l'onglet est caché → notify.
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined" || !("Notification" in window)) return;

    const wasActive =
      prevStateRef.current === "thinking" ||
      prevStateRef.current === "speaking";
    const isIdle = state === "idle";

    if (
      wasActive &&
      isIdle &&
      document.hidden &&
      Notification.permission === "granted"
    ) {
      const body = lastAssistantContent
        ? lastAssistantContent.trim().slice(0, 140) +
          (lastAssistantContent.length > 140 ? "…" : "")
        : "Réponse prête.";
      try {
        const n = new Notification("JARVIS", {
          body,
          tag: "jarvis-response", // remplace la précédente plutôt que d'empiler
          icon: "/favicon.svg",
          silent: false,
        });
        // Click → ramène l'onglet au premier plan
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* silencieux */
      }
    }
    prevStateRef.current = state;
  }, [state, lastAssistantContent, enabled]);
}
