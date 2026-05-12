"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  alpha: number;
  baseAlpha: number;
  pulsePhase: number;
  isNode: boolean;
}

interface Ripple {
  x: number;
  y: number;
  startTime: number;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // DPR capé à 1.5 pour économiser sur écrans retina (qualité largement
    // suffisante pour des particules diffuses).
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let width = window.innerWidth;
    let height = window.innerHeight;

    const setSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();

    // Densité fortement réduite : ~70 particules sur un 1920x1080 (vs 160 avant)
    // pour rester sous les 5000 paires comparées par frame.
    const count = Math.floor((width * height) / 28000);
    particlesRef.current = Array.from({ length: count }, () => {
      const isNode = Math.random() < 0.1;
      const baseAlpha = isNode
        ? Math.random() * 0.4 + 0.55
        : Math.random() * 0.5 + 0.2;
      const baseRadius = isNode
        ? Math.random() * 1.2 + 1.4
        : Math.random() * 1.0 + 0.4;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        baseRadius,
        radius: baseRadius,
        alpha: baseAlpha,
        baseAlpha,
        pulsePhase: Math.random() * Math.PI * 2,
        isNode,
      };
    });

    const onResize = () => setSize();
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const onLeave = () => {
      mouseRef.current.active = false;
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest("button, input, textarea, a, [role='button']")
      ) {
        return;
      }
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        startTime: performance.now(),
      });
      if (ripplesRef.current.length > 3) ripplesRef.current.shift();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("click", onClick);

    const REPULSE_RADIUS = 100;
    const REPULSE_R2 = REPULSE_RADIUS * REPULSE_RADIUS;
    const LINK_RADIUS = 140;
    const LINK_R2 = LINK_RADIUS * LINK_RADIUS;
    const RIPPLE_DURATION = 1400;
    const RIPPLE_MAX_RADIUS = 360;
    let t = 0;

    // Cap le framerate à ~40fps pour soulager le CPU sans rendre l'anim saccadée
    const TARGET_FRAME_MS = 24;
    let lastFrame = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (now - lastFrame < TARGET_FRAME_MS) return;
      lastFrame = now;

      t += 0.024;
      ctx.clearRect(0, 0, width, height);

      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const mouseActive = mouseRef.current.active;

      // Nettoie les ripples expirés
      const ripples = ripplesRef.current.filter(
        (r) => now - r.startTime < RIPPLE_DURATION,
      );
      ripplesRef.current = ripples;

      // Update positions + pulsations + interactions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        else if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        else if (p.y > height + 20) p.y = -20;

        if (p.isNode) {
          const pulse = Math.sin(t + p.pulsePhase) * 0.5 + 0.5;
          p.alpha = p.baseAlpha * (0.7 + pulse * 0.3);
          p.radius = p.baseRadius * (0.95 + pulse * 0.15);
        }

        if (mouseActive) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < REPULSE_R2 && d2 > 1) {
            const d = Math.sqrt(d2);
            const force = (1 - d / REPULSE_RADIUS) * 0.5;
            p.x += (dx / d) * force;
            p.y += (dy / d) * force;
          }
        }

        // Pousse uniquement si ripple actif (la plupart du temps, aucun)
        if (ripples.length) {
          for (const r of ripples) {
            const age = now - r.startTime;
            const progress = age / RIPPLE_DURATION;
            const frontRadius = progress * RIPPLE_MAX_RADIUS;
            const dx = p.x - r.x;
            const dy = p.y - r.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const dist = d - frontRadius;
            if (dist > -20 && dist < 20 && d > 1) {
              const intensity =
                (1 - Math.abs(dist) / 20) * (1 - progress) * 12;
              p.x += (dx / d) * intensity * 0.06;
              p.y += (dy / d) * intensity * 0.06;
            }
          }
        }
      }

      // Dessin des ondes sonar (avant les liens pour qu'elles soient en arrière)
      for (const r of ripples) {
        const age = now - r.startTime;
        const progress = age / RIPPLE_DURATION;
        const radius = progress * RIPPLE_MAX_RADIUS;
        const alpha = (1 - progress) * 0.5;
        ctx.strokeStyle = `rgba(103, 232, 249, ${alpha})`;
        ctx.lineWidth = 1.2 - progress * 0.6;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Liens entre particules — distance uniforme pour simplifier
      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_R2) {
            const proximity = 1 - Math.sqrt(d2) / LINK_RADIUS;
            const linkAlpha =
              p.isNode || q.isNode ? proximity * 0.22 : proximity * 0.1;
            ctx.strokeStyle = `rgba(0, 212, 255, ${linkAlpha})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // Particules : un seul cercle avec shadowBlur (bcp plus rapide que les
      // gradients radiaux pour chacun). On groupe par type pour limiter les
      // changements de state.
      ctx.shadowColor = "rgba(0, 212, 255, 0.85)";

      // Particules normales
      ctx.shadowBlur = 6;
      for (const p of particles) {
        if (p.isNode) continue;
        ctx.fillStyle = `rgba(186, 230, 253, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nœuds
      ctx.shadowBlur = 12;
      for (const p of particles) {
        if (!p.isNode) continue;
        ctx.fillStyle = `rgba(240, 249, 255, ${Math.min(1, p.alpha + 0.15)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reset
      ctx.shadowBlur = 0;
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden
    />
  );
}
