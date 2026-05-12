"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Crosshair JARVIS — un viseur cyan qui suit le curseur avec un léger
 * easing. L'anneau extérieur s'élargit subtilement sur les éléments
 * interactifs (hover sur button/a/input). Masqué sur touch / écrans
 * sans souris fine pour éviter d'encombrer.
 */
export function Crosshair() {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: -100, y: -100 });
  const currentRef = useRef({ x: -100, y: -100 });
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    // Seulement sur dispositifs avec souris fine
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: fine)");
    setEnabled(mq.matches);
    const onChange = () => setEnabled(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: MouseEvent) => {
      targetRef.current.x = e.clientX;
      targetRef.current.y = e.clientY;

      const target = e.target as HTMLElement | null;
      const isInteractive = !!target?.closest(
        "button, a, input, textarea, [role='button'], select, [data-hover]",
      );
      setHovering(isInteractive);
    };

    const onLeave = () => {
      targetRef.current.x = -200;
      targetRef.current.y = -200;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    const animate = () => {
      // Easing exponentiel : le dot suit instantanément, l'anneau a un léger lag
      const dot = dotRef.current;
      const ring = ringRef.current;
      if (dot) {
        dot.style.transform = `translate3d(${targetRef.current.x}px, ${targetRef.current.y}px, 0) translate(-50%, -50%)`;
      }
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * 0.18;
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * 0.18;
      if (ring) {
        ring.style.transform = `translate3d(${currentRef.current.x}px, ${currentRef.current.y}px, 0) translate(-50%, -50%)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Anneau extérieur avec viseur (lag léger) */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 z-[60] pointer-events-none will-change-transform"
        style={{ transform: "translate3d(-100px,-100px,0) translate(-50%,-50%)" }}
      >
        <svg
          width={hovering ? 44 : 32}
          height={hovering ? 44 : 32}
          viewBox="0 0 44 44"
          style={{
            transition: "width 180ms ease, height 180ms ease, opacity 180ms",
            filter: "drop-shadow(0 0 6px rgba(0,212,255,0.7))",
          }}
        >
          <circle
            cx="22"
            cy="22"
            r="20"
            fill="none"
            stroke="rgba(0,212,255,0.85)"
            strokeWidth="1"
            strokeDasharray={hovering ? "4 4" : "2 6"}
          />
          {/* Petits traits cardinaux */}
          {[0, 90, 180, 270].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 22 22)`}>
              <line
                x1="22"
                y1="2"
                x2="22"
                y2="6"
                stroke="rgba(103,232,249,0.95)"
                strokeWidth="1"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Dot central (suit instantanément) */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 z-[60] pointer-events-none will-change-transform"
        style={{ transform: "translate3d(-100px,-100px,0) translate(-50%,-50%)" }}
      >
        <div
          className="h-1 w-1 rounded-full bg-jarvis-white"
          style={{ boxShadow: "0 0 6px rgba(0,212,255,0.95), 0 0 10px rgba(103,232,249,0.7)" }}
        />
      </div>
    </>
  );
}
