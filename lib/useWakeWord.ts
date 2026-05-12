"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "loading" | "listening" | "error";

/**
 * Hook qui écoute en passif le wake word "JARVIS" via Picovoice Porcupine.
 *
 * - Tourne dans le navigateur (WebAssembly) — la clé doit être exposée
 *   côté client (`NEXT_PUBLIC_PICOVOICE_KEY`).
 * - Quand `enabled` est false, on libère le worker pour rendre le micro
 *   au reste de l'app (notamment au SpeechRecognition manuel).
 * - Quand le wake word est détecté, `onDetect()` est appelé.
 */
export function useWakeWord({
  enabled,
  onDetect,
}: {
  enabled: boolean;
  onDetect: () => void;
}): { status: Status; error: string | null } {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Ref pour ne pas recréer le worker quand la callback change.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    const accessKey = process.env.NEXT_PUBLIC_PICOVOICE_KEY;
    if (!accessKey) {
      setStatus("error");
      setError("NEXT_PUBLIC_PICOVOICE_KEY manquante");
      return;
    }

    let cancelled = false;
    let workerInstance: unknown = null;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const [{ PorcupineWorker, BuiltInKeyword }, { WebVoiceProcessor }] =
          await Promise.all([
            import("@picovoice/porcupine-web"),
            import("@picovoice/web-voice-processor"),
          ]);

        const worker = await PorcupineWorker.create(
          accessKey,
          [{ builtin: BuiltInKeyword.Jarvis, sensitivity: 0.6 }],
          () => {
            onDetectRef.current();
          },
          // Modèle Porcupine — déposer `porcupine_params.pv` dans /public.
          { publicPath: "/porcupine_params.pv" },
        );

        if (cancelled) {
          await worker.release();
          return;
        }
        workerInstance = worker;
        await WebVoiceProcessor.subscribe(worker);
        if (cancelled) {
          await WebVoiceProcessor.unsubscribe(worker);
          await worker.release();
          return;
        }
        setStatus("listening");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Porcupine init échouée");
      }
    })();

    return () => {
      cancelled = true;
      (async () => {
        if (!workerInstance) return;
        try {
          const { WebVoiceProcessor } = await import(
            "@picovoice/web-voice-processor"
          );
          await WebVoiceProcessor.unsubscribe(
            workerInstance as Parameters<
              typeof WebVoiceProcessor.unsubscribe
            >[0],
          );
          await (
            workerInstance as { release: () => Promise<void> }
          ).release();
        } catch {
          // Nettoyage best-effort.
        }
      })();
    };
  }, [enabled]);

  return { status, error };
}
