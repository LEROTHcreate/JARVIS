"use client";

import { useEffect, useState } from "react";

type Bridge = { id: string; internalipaddress: string };
type Step = "discover" | "press" | "paired" | "test";

export default function HueSetupPage() {
  const [step, setStep] = useState<Step>("discover");
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [manualIp, setManualIp] = useState("");
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [lights, setLights] = useState<
    { id: string; name: string; on: boolean; brightness: number }[] | null
  >(null);

  // Discover au mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/hue/discover");
        const data = await res.json();
        if (data.bridges) setBridges(data.bridges);
      } catch {
        // user pourra rentrer l'IP manuellement
      }
    })();
  }, []);

  // Poll automatique du pairing
  useEffect(() => {
    if (!polling || !selectedIp) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/hue/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: selectedIp, label: "jarvis#web" }),
        });
        const data = await res.json();
        if (res.ok && data.username) {
          setUsername(data.username);
          setStep("paired");
          setPolling(false);
        } else if (!data.linkButtonPending) {
          // Vraie erreur, pas le bouton qui manque
          setError(data.error ?? "Erreur inconnue");
          setPolling(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
        setPolling(false);
      }
    }, 1500);
    // Arrêt automatique au bout de 60s
    const stop = setTimeout(() => setPolling(false), 60_000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [polling, selectedIp]);

  const startPairing = (ip: string) => {
    setSelectedIp(ip);
    setError(null);
    setStep("press");
    setPolling(true);
  };

  const testConnection = async () => {
    setError(null);
    try {
      const res = await fetch("/api/hue/lights");
      const data = await res.json();
      if (res.ok) {
        setLights(data.lights);
        setStep("test");
      } else {
        setError(data.error ?? "Erreur de test");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    }
  };

  return (
    <div className="min-h-screen bg-jarvis-bg text-jarvis-text p-8 max-w-2xl mx-auto">
      <h1 className="font-display tracking-[0.3em] text-jarvis-cyan text-xl mb-2">
        SETUP · PHILIPS HUE
      </h1>
      <p className="text-jarvis-muted text-sm mb-8">
        Connecte ta Hue Bridge à JARVIS. Le processus prend ~30 secondes.
      </p>

      {/* Step 1 : Discover */}
      {step === "discover" && (
        <section className="space-y-4">
          <div className="font-mono text-[10px] tracking-widest text-jarvis-cyan/70">
            › ÉTAPE 1 — DÉTECTION DE LA BRIDGE
          </div>
          {bridges.length > 0 ? (
            <div className="space-y-2">
              {bridges.map((b) => (
                <button
                  key={b.id}
                  onClick={() => startPairing(b.internalipaddress)}
                  className="block w-full text-left glass-panel rounded-xl p-4 hover:bg-jarvis-cyan/10 transition"
                >
                  <div className="font-mono text-sm text-jarvis-cyan">
                    {b.internalipaddress}
                  </div>
                  <div className="font-mono text-[10px] text-jarvis-muted">
                    {b.id}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-jarvis-muted text-sm">
              Aucune bridge détectée automatiquement.
            </div>
          )}
          <div className="pt-4 border-t border-jarvis-cyan/15">
            <div className="text-xs text-jarvis-muted mb-2">
              Tu connais l'IP de ta bridge ?
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="192.168.1.42"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="flex-1 bg-jarvis-surface border border-jarvis-cyan/30 rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-jarvis-cyan"
              />
              <button
                onClick={() => manualIp && startPairing(manualIp)}
                disabled={!manualIp}
                className="px-4 py-2 rounded-lg bg-jarvis-cyan text-jarvis-bg font-display tracking-wider text-xs disabled:opacity-40"
              >
                UTILISER
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 2 : Press the button */}
      {step === "press" && (
        <section className="space-y-4">
          <div className="font-mono text-[10px] tracking-widest text-jarvis-cyan/70">
            › ÉTAPE 2 — APPUI SUR LE BOUTON
          </div>
          <div className="glass-panel rounded-xl p-6 text-center">
            <div className="text-jarvis-text mb-2">
              Appuie sur le <strong className="text-jarvis-cyan">gros bouton rond</strong>{" "}
              sur le dessus de ta Hue Bridge.
            </div>
            <div className="text-jarvis-muted text-sm">
              Bridge ciblée : <span className="font-mono">{selectedIp}</span>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-jarvis-cyan animate-pulse" />
              <span className="font-mono text-xs text-jarvis-cyan tracking-wider">
                EN ATTENTE DU PAIRING…
              </span>
            </div>
          </div>
          {error && (
            <div className="text-jarvis-danger text-sm font-mono">{error}</div>
          )}
          <button
            onClick={() => {
              setPolling(false);
              setStep("discover");
            }}
            className="text-jarvis-muted text-xs underline"
          >
            ‹ Annuler
          </button>
        </section>
      )}

      {/* Step 3 : Paired */}
      {step === "paired" && username && (
        <section className="space-y-4">
          <div className="font-mono text-[10px] tracking-widest text-jarvis-cyan/70">
            › ÉTAPE 3 — CONFIGURATION
          </div>
          <div className="glass-panel rounded-xl p-4 space-y-3">
            <div className="text-jarvis-text">
              ✓ Pairing réussi. Ajoute ces deux lignes dans{" "}
              <code className="text-jarvis-cyan">.env.local</code> :
            </div>
            <pre className="bg-black/40 rounded-lg p-3 font-mono text-xs text-jarvis-cyan overflow-x-auto">
              <div>HUE_BRIDGE_IP={selectedIp}</div>
              <div>HUE_USERNAME={username}</div>
            </pre>
            <div className="text-jarvis-muted text-xs">
              Redémarre ensuite <code>npm run dev</code> pour que ces variables
              soient prises en compte.
            </div>
          </div>
          <button
            onClick={testConnection}
            className="px-4 py-2 rounded-lg bg-jarvis-cyan text-jarvis-bg font-display tracking-wider text-xs"
          >
            TESTER LA CONNEXION ›
          </button>
          {error && (
            <div className="text-jarvis-danger text-sm font-mono">{error}</div>
          )}
        </section>
      )}

      {/* Step 4 : Test */}
      {step === "test" && lights && (
        <section className="space-y-4">
          <div className="font-mono text-[10px] tracking-widest text-jarvis-cyan/70">
            › ÉTAPE 4 — LAMPES DÉTECTÉES
          </div>
          <div className="glass-panel rounded-xl p-4">
            <div className="text-jarvis-text mb-3">
              ✓ JARVIS voit {lights.length} lampe{lights.length > 1 ? "s" : ""} :
            </div>
            <ul className="space-y-1.5 text-sm">
              {lights.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      l.on ? "bg-jarvis-cyan animate-pulse" : "bg-jarvis-muted/40"
                    }`}
                  />
                  <span className="text-jarvis-text">{l.name}</span>
                  <span className="text-jarvis-muted font-mono text-xs">
                    {l.on ? `ON · ${l.brightness}%` : "OFF"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <a
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-jarvis-cyan text-jarvis-bg font-display tracking-wider text-xs"
          >
            ‹ RETOUR À JARVIS
          </a>
        </section>
      )}
    </div>
  );
}
