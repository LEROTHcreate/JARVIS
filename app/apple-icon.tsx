import { ImageResponse } from "next/og";

// Convention Next.js App Router : ce fichier génère automatiquement
// `/apple-icon` (PNG 180x180), repris par Safari iOS pour "Ajouter à
// l'écran d'accueil" même sur iOS < 16 qui ne lit pas les SVG.
//
// Les iOS modernes (16+) liront aussi notre SVG plus détaillé déclaré
// dans manifest.webmanifest — ce PNG est le fallback raster.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 35%, #0a1428 0%, #03060d 100%)",
          position: "relative",
        }}
      >
        {/* Halo cyan diffus en arrière-plan */}
        <div
          style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,212,255,0.35) 0%, rgba(0,212,255,0) 70%)",
          }}
        />

        {/* Anneau extérieur fin */}
        <div
          style={{
            position: "absolute",
            width: 148,
            height: 148,
            borderRadius: "50%",
            border: "3px dashed rgba(103,232,249,0.6)",
          }}
        />

        {/* Anneau intermédiaire continu */}
        <div
          style={{
            position: "absolute",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "2px solid rgba(0,212,255,0.55)",
          }}
        />

        {/* Orbe central — gradient radial cyan/blanc */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 50% 42%, #f0f9ff 0%, #67e8f9 22%, #00d4ff 50%, rgba(10,132,255,0.55) 75%, rgba(3,6,13,0.9) 100%)",
            boxShadow:
              "0 0 60px 8px rgba(0,212,255,0.45), 0 0 24px 2px rgba(103,232,249,0.55)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
