import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette JARVIS — bleu Stark Industries
        jarvis: {
          bg: "#03060d",
          surface: "#070d1a",
          panel: "#0a1428",
          border: "#16243f",
          cyan: "#00d4ff",
          cyanSoft: "#67e8f9",
          ice: "#dbeafe",
          white: "#f0f9ff",
          blue: "#0a84ff",
          electric: "#3b82f6",
          azure: "#3b82f6",
          glow: "#5eead4",
          danger: "#ff3b6c",
          text: "#e6f1ff",
          muted: "#7a90b8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        terminal: ["var(--font-terminal)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 30px rgba(0, 212, 255, 0.55), 0 0 60px rgba(0, 212, 255, 0.3), 0 0 100px rgba(10, 132, 255, 0.18), inset 0 0 30px rgba(0, 212, 255, 0.18)",
          },
          "50%": {
            boxShadow:
              "0 0 50px rgba(0, 212, 255, 0.85), 0 0 100px rgba(0, 212, 255, 0.5), 0 0 160px rgba(10, 132, 255, 0.35), inset 0 0 40px rgba(0, 212, 255, 0.3)",
          },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "spin-reverse": { to: { transform: "rotate(-360deg)" } },
        scan: {
          "0%, 100%": { transform: "translateY(-100%)" },
          "50%": { transform: "translateY(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "aura-drift": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.55" },
          "50%": { transform: "scale(1.06)", opacity: "0.85" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        "spin-slow": "spin-slow 22s linear infinite",
        "spin-reverse": "spin-reverse 32s linear infinite",
        scan: "scan 3s ease-in-out infinite",
        rise: "rise 0.4s ease-out",
        "aura-drift": "aura-drift 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
