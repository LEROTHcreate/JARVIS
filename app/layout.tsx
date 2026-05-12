import type { Metadata } from "next";
import {
  Chakra_Petch,
  Inter,
  JetBrains_Mono,
  Pixelify_Sans,
} from "next/font/google";
import "./globals.css";

// Display : Chakra Petch — sci-fi militaire / HUD, condensée et lisible
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Body : Inter — référence des UI modernes, ultra crisp à toutes tailles
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

// Terminal : Pixelify Sans — look "ordinateur à l'ancienne" en bâton épais,
// pour la saisie console et les bulles utilisateur.
const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-terminal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JARVIS — Intelligence augmentée",
  description:
    "Assistant IA ultra futuriste. Connaissances illimitées, calculs avancés, cartographie, voix et écrit.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      className={`${chakraPetch.variable} ${inter.variable} ${jetbrainsMono.variable} ${pixelify.variable}`}
    >
      <body className="bg-jarvis-bg text-jarvis-text font-body antialiased">
        {children}
      </body>
    </html>
  );
}
