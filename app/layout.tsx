import type { Metadata, Viewport } from "next";
import {
  Chakra_Petch,
  Inter,
  JetBrains_Mono,
  Pixelify_Sans,
} from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

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
  applicationName: "JARVIS",
  manifest: "/manifest.webmanifest",
  icons: {
    // Logo réacteur PNG cyan — utilisé partout (onglet navigateur, raccourci
    // accueil iOS/Android, écran de splash). On déclare explicitement le PNG
    // unique au lieu de plusieurs tailles : le navigateur s'occupe du resize.
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: ["/icon.png"],
    apple: [{ url: "/icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Active le mode "Web App" sur iOS quand l'utilisateur l'ajoute à son
  // écran d'accueil — l'app s'ouvre en plein écran sans la barre Safari.
  appleWebApp: {
    capable: true,
    title: "JARVIS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Empêche iOS de transformer auto les nombres en liens tel:
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Couleur de la barre de statut mobile (Android Chrome teinte sa
  // barre URL / barre status, iOS via apple-mobile-web-app-status-bar).
  themeColor: "#03060d",
  // Empêche le zoom utilisateur (l'UI JARVIS est déjà pleine page) et
  // étend le viewport jusqu'aux notches sur iPhone (env(safe-area-*)).
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
        <Toaster
          theme="dark"
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: "#0a1428",
              border: "1px solid rgba(0, 212, 255, 0.3)",
              color: "#e6f1ff",
            },
          }}
        />
      </body>
    </html>
  );
}
