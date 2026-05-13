"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  type Group,
  type Points,
  type PointsMaterial,
} from "three";
import type { JarvisState } from "@/types";

interface Props {
  state: JarvisState;
  audioLevel?: number;
  /** Si true, le réacteur passe en palette rouge sang (mode Ultron). */
  ultronMode?: boolean;
}

const SHELL_COUNT = 1400;
const CORE_COUNT = 350;
const HALO_COUNT = 220;
const EXPAND_DURATION_MS = 1500;

// Palettes — 4 nuances pour donner de la profondeur (du plus foncé au plus clair).
const PALETTE_JARVIS = ["#0a84ff", "#1e40af", "#3b82f6", "#67e8f9"];
const PALETTE_ULTRON = ["#dc143c", "#8b0000", "#ff1f2e", "#ff6464"];

// Couleurs uniques (halo, core, glow, anneaux, ambient).
const COLORS_JARVIS = {
  halo: "#3b82f6",
  core: "#dbeafe",
  glowInner: "#0a84ff",
  glowOuter: "#3b82f6",
  ringADash: "#3b82f6",
  ringASoft: "#0a84ff",
  ringBDash: "#0a84ff",
  ringCDash: "#3b82f6",
  ambient: "#3b82f6",
};
const COLORS_ULTRON = {
  halo: "#ff1f2e",
  core: "#ffd1d1",
  glowInner: "#dc143c",
  glowOuter: "#8b0000",
  ringADash: "#ff1f2e",
  ringASoft: "#dc143c",
  ringBDash: "#dc143c",
  ringCDash: "#ff1f2e",
  ambient: "#ff1f2e",
};

/**
 * Sphère de particules JARVIS "particle orb" — version polish.
 *
 * Couches :
 *  - HALO : nuage extérieur dispersé, rotation lente inverse
 *  - SHELL : sphère principale (Fibonacci) avec couleurs/tailles variées
 *            et respiration individuelle par particule (sin déphasé)
 *  - CORE : noyau dense au centre, plus brillant
 *  - 3 anneaux orbitaux pointillés à inclinaisons croisées
 *  - SATELLITES : 1 satellite lumineux par anneau qui glisse en orbite
 */
function ParticleOrb({ state, audioLevel = 0, ultronMode = false }: Props) {
  const palette = ultronMode ? PALETTE_ULTRON : PALETTE_JARVIS;
  const colors = ultronMode ? COLORS_ULTRON : COLORS_JARVIS;
  const tiltRef = useRef<Group>(null);
  const shellRef = useRef<Points>(null);
  const coreRef = useRef<Points>(null);
  const haloRef = useRef<Points>(null);
  const ringARef = useRef<Group>(null);
  const ringBRef = useRef<Group>(null);
  const ringCRef = useRef<Group>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const mountTimeRef = useRef<number | null>(null);

  // Phases individuelles (déphasage pour respiration différente par particule)
  const shellPhases = useMemo(() => {
    const arr = new Float32Array(SHELL_COUNT);
    for (let i = 0; i < SHELL_COUNT; i++) arr[i] = Math.random() * Math.PI * 2;
    return arr;
  }, []);

  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isSpeaking = state === "speaking";
  // `level` pilote l'audio-réactivité (scale + boost couleur). Actif en
  // listening (mic) ET en speaking (TTS) — JARVIS qui parle fait grossir
  // la sphère à chaque syllabe.
  const level =
    isListening || isSpeaking ? Math.max(0.06, audioLevel) : 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Sphère principale : Fibonacci + jitter radial + couleurs variées.
  // La palette dépend de `ultronMode` → recompute quand on toggle.
  const { shellPositions, shellColors, shellBaseRadii } = useMemo(() => {
    const positions = new Float32Array(SHELL_COUNT * 3);
    const vertexColors = new Float32Array(SHELL_COUNT * 3);
    const baseRadii = new Float32Array(SHELL_COUNT);
    const phi = Math.PI * (Math.sqrt(5) - 1);
    const palettePool = palette.map((c) => new Color(c));
    for (let i = 0; i < SHELL_COUNT; i++) {
      const y = 1 - (i / (SHELL_COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const jitter = 0.78 + Math.random() * 0.28;
      baseRadii[i] = jitter;
      positions[i * 3] = Math.cos(theta) * r * jitter;
      positions[i * 3 + 1] = y * jitter;
      positions[i * 3 + 2] = Math.sin(theta) * r * jitter;
      // Distribution couleur biaisée vers la teinte 0 (la plus dense), accents
      // sur la 3e/4e (la plus claire) — fonctionne pareil avec la palette Ultron.
      const rnd = Math.random();
      const c =
        rnd < 0.55
          ? palettePool[0]
          : rnd < 0.78
            ? palettePool[1]
            : rnd < 0.94
              ? palettePool[2]
              : palettePool[3];
      vertexColors[i * 3] = c.r;
      vertexColors[i * 3 + 1] = c.g;
      vertexColors[i * 3 + 2] = c.b;
    }
    return {
      shellPositions: positions,
      shellColors: vertexColors,
      shellBaseRadii: baseRadii,
    };
  }, [ultronMode]);

  // Cœur dense : ~350 particules concentrées (rayon 0..0.45) avec biais vers
  // le centre (cube root pour densité radiale plus forte au cœur)
  const corePositions = useMemo(() => {
    const arr = new Float32Array(CORE_COUNT * 3);
    for (let i = 0; i < CORE_COUNT; i++) {
      const u = Math.random();
      const radius = Math.pow(u, 0.65) * 0.45;
      const phi = Math.random() * Math.PI * 2;
      const costheta = Math.random() * 2 - 1;
      const sintheta = Math.sqrt(1 - costheta * costheta);
      arr[i * 3] = Math.cos(phi) * sintheta * radius;
      arr[i * 3 + 1] = costheta * radius;
      arr[i * 3 + 2] = Math.sin(phi) * sintheta * radius;
    }
    return arr;
  }, []);

  // Halo extérieur dispersé
  const haloPositions = useMemo(() => {
    const arr = new Float32Array(HALO_COUNT * 3);
    for (let i = 0; i < HALO_COUNT; i++) {
      const phi = Math.random() * Math.PI * 2;
      const costheta = Math.random() * 2 - 1;
      const sintheta = Math.sqrt(1 - costheta * costheta);
      const r = 1.1 + Math.random() * 0.35;
      arr[i * 3] = Math.cos(phi) * sintheta * r;
      arr[i * 3 + 1] = costheta * r;
      arr[i * 3 + 2] = Math.sin(phi) * sintheta * r;
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    const now = performance.now();
    if (mountTimeRef.current === null) mountTimeRef.current = now;
    const expandRaw = Math.min(
      1,
      (now - mountTimeRef.current) / EXPAND_DURATION_MS,
    );
    const expand = 1 - Math.pow(1 - expandRaw, 3);
    const t = now / 1000;

    // Parallax souris : UNIQUEMENT rotation (tilt 3D), pas de translation
    // pour que la sphère et les anneaux restent toujours centrés à
    // l'origine, peu importe la position de la souris.
    if (tiltRef.current) {
      const driftX = Math.sin(t * 0.25) * 0.025;
      const driftY = Math.cos(t * 0.22) * 0.03;
      const targetX = -mouseRef.current.y * 0.45 + driftX;
      const targetY = mouseRef.current.x * 0.55 + driftY;
      tiltRef.current.rotation.x +=
        (targetX - tiltRef.current.rotation.x) * 0.08;
      tiltRef.current.rotation.y +=
        (targetY - tiltRef.current.rotation.y) * 0.08;
    }

    // Sphère principale : rotation + respiration individuelle des particules
    if (shellRef.current) {
      shellRef.current.rotation.y += dt * 0.18;
      shellRef.current.rotation.x += dt * 0.04;

      // Anime la radius de chaque particule via sin déphasé (effet vivant)
      const posAttr = shellRef.current.geometry.getAttribute("position");
      const arr = posAttr.array as Float32Array;
      const breath = 0.04 + level * 0.08; // amplitude
      for (let i = 0; i < SHELL_COUNT; i++) {
        const r0 = shellBaseRadii[i];
        const phase = shellPhases[i];
        const r = r0 + Math.sin(t * 1.6 + phase) * breath;
        const ratio = r / r0;
        // Position originale = pos cartésienne pour r0. On scale par ratio.
        arr[i * 3] = shellPositions[i * 3] * ratio;
        arr[i * 3 + 1] = shellPositions[i * 3 + 1] * ratio;
        arr[i * 3 + 2] = shellPositions[i * 3 + 2] * ratio;
      }
      posAttr.needsUpdate = true;

      // Pulsation globale par état — speaking/listening grossissent la
      // sphère à chaque syllabe via `level` (signal audio)
      const pulse = isThinking
        ? 1 + Math.sin(t * 5) * 0.05
        : isSpeaking
          ? 1 + level * 0.28
          : isListening
            ? 1 + level * 0.18
            : 1 + Math.sin(t * 1.4) * 0.02;
      const target = pulse * expand;
      const cur = shellRef.current.scale.x;
      shellRef.current.scale.setScalar(cur + (target - cur) * 0.22);

      const mat = shellRef.current.material as PointsMaterial;
      // Opacité boostée en speaking → plus dense visuellement, plus bleu
      const targetOpacity = isThinking
        ? 1
        : isSpeaking
          ? Math.min(1, 0.95 + level * 0.15)
          : isListening
            ? 0.92 + level * 0.08
            : 0.85;
      mat.opacity += (targetOpacity - mat.opacity) * 0.1;
      // Boost taille des points en speaking pour effet "plus dense / plus bleu"
      const targetSize = isSpeaking ? 0.032 + level * 0.018 : 0.032;
      mat.size += (targetSize - mat.size) * 0.15;
    }

    // Cœur dense : pulse rapide (effet "battement")
    if (coreRef.current) {
      coreRef.current.rotation.y -= dt * 0.25;
      const beat =
        Math.exp(-Math.pow(((t * 0.85) % 1.0) - 0.05, 2) * 80) +
        Math.exp(-Math.pow(((t * 0.85) % 1.0) - 0.18, 2) * 80) * 0.6;
      const target = (1 + beat * 0.18 + level * 0.15) * expand;
      const cur = coreRef.current.scale.x;
      coreRef.current.scale.setScalar(cur + (target - cur) * 0.2);
    }

    // Halo : rotation lente inverse + respiration douce
    if (haloRef.current) {
      haloRef.current.rotation.y -= dt * 0.06;
      const pulse = 1 + Math.sin(t * 0.8) * 0.04 + level * 0.1;
      const target = pulse * expand;
      const cur = haloRef.current.scale.x;
      haloRef.current.scale.setScalar(cur + (target - cur) * 0.1);
    }

    // Anneaux orbitaux : rotations différenciées + scale d'expansion
    const ringScale = expand;
    if (ringARef.current) {
      ringARef.current.rotation.z += dt * 0.12;
      ringARef.current.scale.setScalar(ringScale);
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.z -= dt * 0.09;
      ringBRef.current.scale.setScalar(ringScale);
    }
    if (ringCRef.current) {
      ringCRef.current.rotation.z += dt * 0.06;
      ringCRef.current.scale.setScalar(ringScale);
    }
  });

  return (
    <group ref={tiltRef}>
      {/* Halo extérieur — nuage de points dispersés */}
      <points ref={haloRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[haloPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={colors.halo}
          size={0.022}
          sizeAttenuation
          transparent
          opacity={0.5}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Sphère principale — vertex colors pour profondeur de palette */}
      <points ref={shellRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[shellPositions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[shellColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.032}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
          vertexColors
        />
      </points>

      {/* Cœur dense — particules concentrées au centre, plus brillantes */}
      <points ref={coreRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[corePositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={colors.core}
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 2 halos additifs autour du cœur (pseudo-bloom) */}
      <mesh>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshBasicMaterial
          color={colors.glowInner}
          transparent
          opacity={0.18}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshBasicMaterial
          color={colors.glowOuter}
          transparent
          opacity={0.07}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Anneau A — orbite équatoriale, dense */}
      <group ref={ringARef} rotation={[Math.PI / 2 - 0.1, 0, 0]}>
        <DashedRing radius={1.2} segments={72} color={colors.ringADash} opacity={0.95} />
      </group>

      {/* Anneau A' — léger trail continu fin par-dessus l'anneau A pour
          renforcer le glow circulaire (anneau plein très transparent) */}
      <group rotation={[Math.PI / 2 - 0.1, 0, 0]}>
        <SoftRing radius={1.2} color={colors.ringASoft} opacity={0.18} tube={0.003} />
      </group>

      {/* Anneau B — orbite inclinée à ~60° */}
      <group ref={ringBRef} rotation={[Math.PI / 3, 0.4, 0]}>
        <DashedRing radius={1.35} segments={88} color={colors.ringBDash} opacity={0.8} />
      </group>

      {/* Anneau C — orbite presque polaire */}
      <group ref={ringCRef} rotation={[0.3, 1.1, 0]}>
        <DashedRing radius={1.5} segments={96} color={colors.ringCDash} opacity={0.65} />
      </group>

    </group>
  );
}

/**
 * Anneau continu fin (torus complet) — utilisé en superposition d'un
 * DashedRing pour créer un glow circulaire qui relie les segments.
 */
function SoftRing({
  radius,
  tube,
  color,
  opacity,
}: {
  radius: number;
  tube: number;
  color: string;
  opacity: number;
}) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, tube, 8, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Anneau pointillé : N petits segments répartis sur un cercle.
 */
function DashedRing({
  radius,
  segments,
  color,
  opacity,
}: {
  radius: number;
  segments: number;
  color: string;
  opacity: number;
}) {
  const dashes = useMemo(() => {
    const out: { angle: number }[] = [];
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 0) out.push({ angle: (i / segments) * Math.PI * 2 });
    }
    return out;
  }, [segments]);

  return (
    <>
      {dashes.map((d, i) => {
        const x = Math.cos(d.angle) * radius;
        const z = Math.sin(d.angle) * radius;
        return (
          <mesh
            key={i}
            position={[x, 0, z]}
            rotation={[0, -d.angle + Math.PI / 2, 0]}
          >
            <boxGeometry args={[0.05, 0.005, 0.008]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

export function ArcReactor3D(props: Props) {
  const ambientColor = props.ultronMode
    ? COLORS_ULTRON.ambient
    : COLORS_JARVIS.ambient;

  // Contre-filtre Ultron : on neutralise EXACTEMENT le filter du conteneur
  // `.ultron-mode` (hue-rotate 172° + saturate 1.55 + brightness 0.82 +
  // contrast 1.18) en appliquant les inverses sur un wrapper autour du
  // Canvas. Indispensable car React Three Fiber ne propage pas les attributs
  // DOM custom (genre `data-no-filter`) jusqu'à l'élément `<canvas>` réel —
  // la règle CSS générique ne pouvait donc pas matcher. Avec ce wrapper +
  // filter inline, le canvas affiche ses vraies couleurs source → la palette
  // rouge Ultron reste rouge à l'écran (au lieu d'être teintée vert/cyan
  // par le hue-rotate global).
  const counterFilter = props.ultronMode
    ? "hue-rotate(-172deg) saturate(0.645) brightness(1.22) contrast(0.847)"
    : undefined;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        filter: counterFilter,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.18} color={ambientColor} />
        <ParticleOrb {...props} />
      </Canvas>
    </div>
  );
}
