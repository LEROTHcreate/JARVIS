# Contexte pour Claude Code

Ce fichier sert de mémoire de contexte quand tu travailles sur le projet JARVIS avec Claude Code (`claude` en CLI ou via l'extension VS Code).

## Identité du projet

JARVIS est un assistant IA conversationnel inspiré de l'univers Iron Man. L'expérience visuelle est centrale : tout doit donner la sensation d'utiliser une interface holographique Stark Industries. Le fond reste **toujours noir spatial**, les accents sont **cyan/bleu**, jamais de violet, jamais de pastel.

## Conventions de code

- **TypeScript strict** partout, pas de `any` sauf pour les shims (Web Speech API typing manquant).
- **Composants** : functional components, hooks. Tout composant côté client commence par `"use client"`.
- **Styling** : Tailwind avec la palette `jarvis-*` définie dans `tailwind.config.ts`. Pas de styles inline sauf pour les gradients radiaux dynamiques.
- **Animations** : Framer Motion pour les transitions React, CSS keyframes pour les boucles infinies (rotation, pulse).
- **Fichiers** : un composant par fichier, nommé en PascalCase. Hooks dans `lib/`. Types globaux dans `types/index.ts`.

## Communication avec le LLM (Groq)

- Provider : **Groq** via son endpoint OpenAI-compatible (`/openai/v1/chat/completions`). Modèle par défaut `llama-3.3-70b-versatile`. Clé `GROQ_API_KEY`, modèle override `GROQ_MODEL`.
- Streaming SSE (Server-Sent Events) sur `/api/chat`. Le serveur transcode le SSE OpenAI-style de Groq en events SSE applicatifs : `{type:"delta",text}`, `{type:"pins",pins}`, `{type:"tool_call",name,args}`.
- Format de message côté client : `{ id, role: "user"|"assistant", content }`. Les exchanges d'outils ne sont **pas persistés côté client** — chaque appel à `/api/chat` recommence sans contexte d'outils précédent.
- Le system prompt est dans `lib/claude.ts` (nom historique — le fichier sert maintenant de client Groq). **Toujours le mettre à jour en cohérence** si on ajoute des capacités.
- Protocole carto : JARVIS termine ses réponses spatiales par `[[MAP]]{"pins":[...]}[[/MAP]]`. Le parser `extractMapPins` extrait les broches côté serveur, qui les pousse en event SSE `{type:"pins",pins:[...]}` consommé par `app/page.tsx`. Le bloc est filtré du flux texte pendant le streaming pour ne pas montrer le JSON brut.

### Tools (function calling Groq)

- Déclarés dans `JARVIS_TOOLS` (`lib/claude.ts`), format OpenAI (`{type:"function",function:{name,description,parameters}}`).
- Dispatcher côté serveur : `executeTool(name, rawArgs, ctx?)` dans `lib/claude.ts`. Le `ToolContext` porte `userLocation?: {lat, lng}` quand le client l'a fournie.
- Boucle multi-tour dans `app/api/chat/route.ts` : tant que Groq renvoie des `tool_calls`, on exécute, on ajoute `{role:"assistant",tool_calls}` + `{role:"tool",content,tool_call_id}` à la conversation, on relance. Cap à `MAX_TOOL_ITER = 5` pour éviter les boucles.
- Pour ajouter un nouvel outil : entrée dans `JARVIS_TOOLS` + branche dans `executeTool` (utiliser `ctx` si l'outil a besoin de contexte client). Documenter l'usage dans le system prompt.
- Outils actifs :
  - `web_search(query)` → Tavily (cf. `lib/tavily.ts`, clé `TAVILY_API_KEY`, tier gratuit 1000 req/mois). Retourne `{query, answer, results: [{title, url, content}]}`.
  - `find_nearby(query, radius_m?)` → Overpass / OpenStreetMap (cf. `lib/nearby.ts`, gratuit sans clé). Mots-clés FR/EN mappés vers les tags OSM (`shop=bakery`, `amenity=restaurant`, etc.). Retourne `{query, center, count, results: [{name, lat, lng, description, distance_m}]}`. Exige `ctx.userLocation`, sinon renvoie une erreur que le LLM relaie à l'utilisateur. Côté client : `app/page.tsx` héberge `userLocation` + un heuristique `needsLocationHint(text)` qui déclenche la demande de géoloc en parallèle du fetch pour les requêtes locales.

### Wake word "JARVIS"

- Provider : **Picovoice Porcupine Web** (WASM, tourne offline dans le navigateur). Mot-clé "Jarvis" intégré (`BuiltInKeyword.Jarvis`).
- Clé : `NEXT_PUBLIC_PICOVOICE_KEY` (exposée côté client — c'est attendu pour la lib WASM).
- Hook : `lib/useWakeWord.ts` — gère la création du `PorcupineWorker`, l'abonnement au `WebVoiceProcessor`, la libération propre. Retourne `{status, error}`.
- Intégration : `ChatInterface` instancie le hook avec `enabled: wakeWordEnabled && !recording`. Quand le hook détecte le wake word, il appelle `startRecording()` (Web Speech API) et `stopTTS()`. La suspension pendant `recording` évite le conflit micro avec le SpeechRecognition manuel.
- UI : icône `Radio` dans la barre d'input desktop, point cyan pulsant quand `status === "listening"`. Désactivé sur mobile (battery drain).

### TTS (voix JARVIS)

- Provider : **Cartesia Sonic-2** multilingual (cf. `lib/cartesia.ts`). Clé `CARTESIA_API_KEY`, voix `CARTESIA_VOICE_ID`. Tier gratuit ~100k caractères/mois.
- Endpoint serveur : `POST /api/tts` → reçoit `{text, language?}` et streame du MP3 (`audio/mpeg`) en retour. Pipe direct depuis `synthesizeCartesia()` vers la Response — pas de tampon serveur.
- Côté client : `ChatInterface` déclenche `/api/tts` quand `voiceOutput` est activé + state idle + nouveau message assistant. L'audio est joué via `new Audio(URL.createObjectURL(blob))`, refs (`ttsAudioRef`, `ttsAbortRef`, `ttsObjectUrlRef`) géreées par un helper `stopTTS()` appelé à l'unmount, sur toggle off, et à chaque retour en `thinking`/`speaking`.
- L'ancienne synthèse navigateur (`speechSynthesis`) a été retirée — si Cartesia est down ou la clé absente, la voix échoue silencieusement et l'UI continue.
- Amélioration future : streaming sentence-par-sentence pour démarrer l'audio AVANT la fin du streaming texte (utiliser `/tts/sse` Cartesia + MSE côté client).

### Multimodal (vision)

- L'utilisateur peut joindre **une image par message** via le bouton trombone ou drag-and-drop sur la fenêtre.
- Côté client : l'image est encodée en data URL (`data:image/...;base64,...`) et stockée sur le `ChatMessage` (`image?: string`). Limite défensive 5 MB.
- Côté serveur : si au moins un message du conv contient `image`, `streamGroqChat` bascule sur `GROQ_VISION_MODEL` (défaut `meta-llama/llama-4-scout-17b-16e-instruct`) et convertit le content de ce message en array OpenAI multimodal `[{type:"text",text}, {type:"image_url",image_url:{url}}]`.
- Le vision model doit supporter le function calling pour rester compatible avec `web_search` & co.

### Polish UX (indicateurs vivants)

- **Indicateur de tool call** : l'event SSE `{type:"tool_call", name, args}` est consommé par `app/page.tsx` qui maintient un state `activeTool: {name, query}`. Une pill HUD (glass-panel rond + icône `Search`/`MapPin` + label + query entre guillemets) apparaît en haut sous le header pendant tout l'appel d'outil. Effacée dans le `finally` de `sendMessage` (et à chaque nouveau tool_call qui la remplace).
- **Stop button** : pendant `state === "thinking" || "speaking"`, le bouton ENVOYER se transforme en STOP rouge (`Square` icon). `ChatInterface.handleStop` coupe la TTS en cours, marque la réponse partielle comme déjà lue (`lastSpokenRef`) pour empêcher la TTS de la prononcer, puis appelle `onStop` qui annule le fetch via `abortRef`.
- **Audio-réactif sur la TTS** : `ChatInterface` branche un `AnalyserNode` sur l'`HTMLAudioElement` Cartesia via `createMediaElementSource`. Boucle `requestAnimationFrame` qui émet `onAudioLevel` (RMS) + `onAudioBands` (12 bandes FFT, même format que le mic). Notifie aussi `onTtsPlayingChange(true/false)`. Côté page, `ttsPlaying && state === "idle"` force `orbState = "speaking"` → l'orbe affiche ses visuels de transmission tant que la voix joue, et reçoit les vrais niveaux audio.
- **Wake word ack flash** : à la détection, `ChatInterface` joue un bip 880 Hz / 150 ms via Web Audio (`OscillatorNode`), puis appelle `onWakeWordDetect()` qui incrémente `wakeFlashKey` côté page. Un halo radial cyan s'expanse et fade-out en ~700 ms, centré sur l'orbe.
- **Panneau de sources** : pour `web_search`, le serveur émet un nouvel event SSE `{type:"tool_result", name, result}` après l'exécution. `page.tsx` consomme ce résultat pour alimenter `webSources` (titre/url/extrait Tavily). `components/SourcesPanel.tsx` affiche une colonne à gauche de l'orbe (md+) avec les sources cliquables, vidée à chaque nouvelle question utilisateur. Les `tool_result` non-JSON sont ignorés.

## Règles UX

1. **Jamais d'écran blanc.** Toute transition doit avoir un état de chargement avec l'orbe en mode `thinking`.
2. **L'orbe est l'élément central.** Tout le reste est secondaire et peut disparaître.
3. **Voix prioritaire.** Le bouton micro est toujours accessible, jamais caché derrière un menu.
4. **Mobile responsive** : implémenté. L'orbe reste centré et le chat passe en plein écran modal sur mobile.

## États de JARVIS

| État | Quand | Visuel |
|---|---|---|
| `idle` | Au repos | Orbe pulse doucement |
| `listening` | Reco vocale active | Anneau audio-réactif autour de l'orbe (basé sur `audioLevel` du `ChatInterface`) |
| `thinking` | Requête en cours côté serveur | Orbe pulse rapide + scale |
| `speaking` | Streaming de tokens en cours | Barres d'onde sonore dans l'orbe |

## Commandes utiles

```bash
npm run dev          # Dev server
npm run build        # Build prod
npm run type-check   # Vérif TS sans build
```

## Pièges connus

- **Leaflet + SSR** : `MapPanel` doit être chargé via `next/dynamic` avec `ssr: false`. Toute modification du composant doit garder cette contrainte.
- **Web Speech API** : Safari et Firefox ne supportent pas la reconnaissance vocale. Afficher un fallback (déjà en place : alert).
- **Streaming Groq** : si le bloc `[[MAP]]` arrive en milieu de stream, on coupe l'affichage pour ne pas montrer le JSON brut. Voir `app/api/chat/route.ts`. Attention : le serveur retient les 6 derniers caractères tant qu'on n'a pas vu `[[MAP]]` complet, pour éviter de leaker un préfixe de sentinelle.
- **Mobile responsive** : implémenté. Sur mobile, l'orbe reste centré, la liste de messages s'affiche en plein écran (auto-ouvert à chaque réponse JARVIS), la barre de saisie reste fixée en bas (z-30 sous la map z-40).

## Prochaines tâches naturelles

Voir la roadmap dans `README.md`. Quand Nicolas demande d'avancer, propose-lui un choix entre 2-3 chantiers et estime la complexité.

## Style de réponse de Claude Code

- Tu peux tutoyer Nicolas.
- Réponses en français.
- Pas de longs préambules. Va à l'action.
- Si un changement touche plusieurs fichiers, lister les fichiers modifiés en fin de réponse.
