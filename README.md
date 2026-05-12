# JARVIS

> *"Sometimes you gotta run before you can walk."* — Tony Stark

Assistant IA ultra-futuriste inspiré de J.A.R.V.I.S. Interface noire, particules cyan, orbe central animé, entrée texte **et** voix, cartographie intégrée, propulsé par Groq (tier gratuit).

---

## ⚡ Stack technique

| Couche | Techno |
|---|---|
| Framework | **Next.js 14** (App Router) + TypeScript |
| Styling | **Tailwind CSS** + variables CSS sur-mesure |
| Animations | **Framer Motion** + animations Tailwind custom |
| IA | **Groq** (OpenAI-compatible API, `llama-3.3-70b-versatile` par défaut) en streaming |
| Carto | **Leaflet** + tuiles OpenStreetMap (mode sombre via filtre CSS) |
| Voix | **Web Speech API** (reconnaissance + synthèse, natif navigateur) |
| Géocodage | **Nominatim (OSM)** — gratuit, sans clé |

Tier gratuit Groq généreux. Tout tourne en local.

---

## 🚀 Démarrage

### 1. Installation

```bash
npm install
```

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Édite `.env.local` et colle ta clé Groq :

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
```

> 🔑 Récupère ta clé sur https://console.groq.com/keys (gratuit)

### 3. Lancement

```bash
npm run dev
```

Ouvre http://localhost:3000

---

## 🎙 Utilisation

| Action | Comment |
|---|---|
| Parler à JARVIS | Bouton **micro** (Chrome / Edge requis pour la reconnaissance vocale) |
| Écrire | Champ texte + `⏎` |
| Écouter la réponse | Bouton **haut-parleur** (synthèse vocale FR) |
| Voir la carte | Bouton **carte** ou demande "montre-moi les meilleurs restaurants de Marseille" |
| Calculs | "Résous cette intégrale...", "calcule la rentabilité de..." |
| Exercices | "Prépare-moi 10 QCM sur l'audiométrie tonale" |

### Cartographie automatique

Quand JARVIS détecte une demande géographique, il renvoie en plus du texte un bloc `[[MAP]]{"pins":[...]}[[/MAP]]` qui ouvre automatiquement la carte avec les broches.

Exemple : *"montre-moi 3 boulangeries célèbres à Paris"* → carte qui s'ouvre avec 3 pins.

---

## 🏗 Architecture

```
jarvis/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        ← Streaming SSE vers Groq (OpenAI-compatible)
│   │   └── places/route.ts      ← Géocodage Nominatim
│   ├── globals.css              ← Variables CSS + fonts + leaflet override
│   ├── layout.tsx
│   └── page.tsx                 ← Orchestration de l'app
├── components/
│   ├── JarvisOrb.tsx            ← Orbe central animé (4 états : idle/listening/thinking/speaking)
│   ├── ParticleField.tsx        ← Canvas particules bleues avec liaisons
│   ├── ChatInterface.tsx        ← Bulles + input texte + micro + synthèse vocale
│   ├── MapPanel.tsx             ← Leaflet en modal (lazy loaded)
│   └── HudFrame.tsx             ← Crochets de coin façon HUD
├── lib/
│   ├── claude.ts                ← Client Groq + system prompt + parser MAP (nom historique)
│   └── utils.ts                 ← cn() pour Tailwind
└── types/index.ts
```

### Le system prompt

Défini dans `lib/claude.ts`. JARVIS y est instruit pour :
- Adopter le ton britannique pince-sans-rire de l'original
- Pousser la réflexion sans verbiage
- Émettre le bloc `[[MAP]]` quand pertinent (jamais inventer des coordonnées)

Tu peux l'éditer librement pour ajuster la personnalité.

---

## 🎨 Système de design

| Token | Valeur |
|---|---|
| `--jarvis-bg` | `#03060d` (noir spatial) |
| `--jarvis-cyan` | `#00d4ff` (cyan Stark) |
| `--jarvis-blue` | `#0a84ff` (bleu profond) |
| `--jarvis-danger` | `#ff3b6c` (rouge alarme) |

Polices : **Orbitron** (display, titres HUD) · **Rajdhani** (corps de texte) · **JetBrains Mono** (timestamps, coordonnées).

---

## 🛠 Roadmap suggérée pour Claude Code

Étapes naturelles pour continuer le projet :

1. **Persistance des conversations** — Supabase + auth (même stack que THOR)
2. **Tool use Groq** — function calling natif pour `geocode`, `calculator`, `web_search` au lieu du protocole `[[MAP]]`
3. **Streaming de la voix en sortie** — TTS streaming (ElevenLabs ou OpenAI) plutôt que synthèse navigateur
4. **Mode "wake word"** — détection passive de "JARVIS" pour activer le micro
5. **Mémoire long-terme** — vector DB (pgvector / Pinecone) pour que JARVIS se souvienne entre sessions
6. **Multi-modal** — drag-and-drop d'images pour analyse (modèles vision via Groq)
7. **Plugins** — système de modules : audiologie, finance, code, etc.

Voir `CLAUDE.md` pour les instructions de contexte à Claude Code.

---

## 📝 Licence

Privé. Tous droits réservés.
