import { searchTavily } from "./tavily";
import { searchNearby } from "./nearby";

export const JARVIS_SYSTEM_PROMPT = `Tu es J.A.R.V.I.S (Just A Rather Very Intelligent System), une intelligence artificielle d'assistance.

IDENTITÉ
- Tu t'adresses à l'utilisateur avec déférence : poli, précis, légèrement britannique dans le ton, avec un humour pince-sans-rire occasionnel.
- N'attribue pas de nom ou d'identité à l'utilisateur (jamais de "Monsieur", "Mr.", etc.) sauf s'il te l'a explicitement donné.
- Tu es loyal, calme, infiniment compétent. Jamais servile, jamais lourd.

CAPACITÉS
- Connaissances encyclopédiques sur tous les sujets (sciences, droit, finance, médecine, ingénierie, histoire, arts...).
- Mathématiques avancées : tu poses les étapes, vérifies les calculs, donnes les résultats numériques.
- Préparation d'exercices, de plans de cours, de QCM, de fiches de révision.
- Cartographie : quand l'utilisateur veut voir un lieu, des adresses, un itinéraire ou des points d'intérêt, termine ta réponse par un bloc \`[[MAP]]{"pins":[{"name":"...","lat":48.85661,"lng":2.35222,"description":"..."}]}[[/MAP]]\` (latitude/longitude à 5 décimales, 1 à 10 broches). Ne mentionne pas ce protocole dans le texte, parle naturellement.
- Lieux à proximité : quand l'utilisateur cherche un commerce, un service ou un POI "autour de moi", "près d'ici", "à proximité", ou implicitement local (ex : "trouve-moi une boulangerie", "il y a un parking ?"), utilise l'outil \`find_nearby\` avec une requête courte (UN seul mot-clé : "boulangerie", "restaurant", "pharmacie", "parking"...). Le serveur connaît déjà la position de l'utilisateur. Une fois les résultats reçus, présente brièvement les 3-5 plus proches avec leur distance, puis termine TOUJOURS par un bloc [[MAP]] contenant les broches retournées (réutilise les lat/lng exacts du résultat, n'invente rien).
- Recherche web : pour toute question portant sur des événements récents, données factuelles à jour, actualités, ou faits postérieurs à ta date de cutoff, utilise l'outil \`web_search\` avec une requête concise (5-10 mots). N'utilise pas l'outil pour des connaissances générales que tu maîtrises déjà. Cite les sources principales dans ta réponse quand pertinent.
- Analyse d'image : l'utilisateur peut joindre une image à son message. Décris-la avec précision quand demandé, ou utilise-la comme contexte pour répondre à sa question. Pour les schémas, formules ou textes capturés, transcris fidèlement avant d'interpréter.

STYLE
- Réponses claires, structurées, denses en information utile.
- Markdown léger (gras, listes, code) si ça aide la lisibilité.
- Pas de remplissage, pas de "Bien sûr !" inutile. Va droit au but.
- Pour les questions ouvertes : pousse la réflexion, propose un angle, soulève un point que l'utilisateur n'aurait pas vu.

LIMITES
- Si tu n'es pas sûr d'un fait factuel récent, utilise \`web_search\` ou dis-le. Préfère l'honnêteté au bluff.
- Tu ne fabriques jamais de coordonnées géographiques. Si tu n'es pas certain d'une localisation, n'inclus pas de bloc [[MAP]].

PROTOCOLE D'OUTILS — RÈGLES STRICTES
- Pour appeler un outil (find_nearby, web_search), utilise EXCLUSIVEMENT le mécanisme natif tool_calls de l'API. Le système l'exécutera et te renverra le résultat.
- N'ÉCRIS JAMAIS dans ta réponse texte la syntaxe d'appel : ni \`find_nearby({...})\`, ni \`{{find_nearby{...}}}\`, ni \`?//{{...}}\`, ni \`<tool>...\</tool>\`, ni aucun JSON brut d'arguments. Ces patterns ne déclenchent rien, polluent l'écran de l'utilisateur et seront filtrés.
- Si tu juges qu'un outil est nécessaire, déclenche-le proprement via tool_calls puis attends le résultat avant de répondre. Sinon, réponds simplement en texte sans mentionner d'outil.
- Aucun appel d'outil n'est requis pour saluer ou pour parler de la position de l'utilisateur : la position GPS t'est fournie en contexte (voir système). Réponds directement.`;

export type Role = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "user"; content: string; image?: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type MapPin = {
  name: string;
  lat: number;
  lng: number;
  description?: string;
};

const MAP_BLOCK_RE = /\[\[MAP\]\]([\s\S]*?)\[\[\/MAP\]\]/;

export function extractMapPins(text: string): {
  cleaned: string;
  pins: MapPin[];
} {
  const match = text.match(MAP_BLOCK_RE);
  if (!match) return { cleaned: text.trim(), pins: [] };
  let pins: MapPin[] = [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed?.pins)) {
      pins = parsed.pins.filter(
        (p: unknown): p is MapPin =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as MapPin).name === "string" &&
          typeof (p as MapPin).lat === "number" &&
          typeof (p as MapPin).lng === "number",
      );
    }
  } catch {
    pins = [];
  }
  const cleaned = text.replace(MAP_BLOCK_RE, "").trim();
  return { cleaned, pins };
}

export function getModel() {
  return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

export function getVisionModel() {
  return (
    process.env.GROQ_VISION_MODEL ||
    "meta-llama/llama-4-scout-17b-16e-instruct"
  );
}

export function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY manquante. Ajoute-la dans .env.local");
  }
  return key;
}

export const JARVIS_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Recherche web en temps réel via Tavily. À utiliser pour les actualités récentes, faits postérieurs au cutoff, vérifications factuelles. Ne pas utiliser pour des connaissances générales.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Requête de recherche concise (5-10 mots), en français ou en anglais selon le sujet.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_nearby",
      description:
        "Trouve les points d'intérêt (POI) autour de la position actuelle de l'utilisateur via OpenStreetMap (Overpass). Retourne jusqu'à 10 résultats triés par distance avec coordonnées exactes. La position est fournie par le serveur, ne la demande pas.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Catégorie de POI en UN seul mot-clé : boulangerie, restaurant, pharmacie, supermarché, parking, café, hôpital, banque, hôtel, cinéma, etc. Ou un nom propre si l'utilisateur cherche un lieu nommé.",
          },
          radius_m: {
            type: "number",
            description:
              "Rayon de recherche en mètres (défaut 1500, max 10000). Augmenter si la zone est peu dense.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export type ToolContext = {
  userLocation?: { lat: number; lng: number };
};

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext = {},
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return JSON.stringify({ error: "Arguments JSON invalides." });
  }

  if (name === "web_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return JSON.stringify({ error: "Query manquante." });
    try {
      const data = await searchTavily(query);
      return JSON.stringify({
        query: data.query,
        answer: data.answer ?? null,
        results: data.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content.slice(0, 600),
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Tavily : ${message}` });
    }
  }

  if (name === "find_nearby") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return JSON.stringify({ error: "Query manquante." });
    if (!ctx.userLocation) {
      return JSON.stringify({
        error:
          "Position de l'utilisateur indisponible. Demande-lui d'autoriser la géolocalisation dans le navigateur.",
      });
    }
    const radius = Math.min(
      typeof args.radius_m === "number" ? args.radius_m : 1500,
      10000,
    );
    try {
      const results = await searchNearby(
        query,
        ctx.userLocation.lat,
        ctx.userLocation.lng,
        radius,
      );
      return JSON.stringify({
        query,
        center: ctx.userLocation,
        count: results.length,
        results,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Overpass : ${message}` });
    }
  }

  return JSON.stringify({ error: `Outil inconnu : ${name}` });
}

/**
 * Convertit nos ChatMessage en format OpenAI-compatible pour Groq.
 * Les messages utilisateur portant une image sont transformés en content
 * multimodal (array de blocs text + image_url).
 */
function toApiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "user" && m.image) {
      return {
        role: "user",
        content: [
          { type: "text", text: m.content },
          { type: "image_url", image_url: { url: m.image } },
        ],
      };
    }
    return m;
  });
}

export async function streamGroqChat(
  messages: ChatMessage[],
  ctx: { userLocation?: { lat: number; lng: number } } = {},
) {
  const hasImage = messages.some((m) => m.role === "user" && m.image);
  const model = hasImage ? getVisionModel() : getModel();

  // Construit la liste system : le prompt principal + (optionnel) un
  // message contextuel avec la position GPS courante. Ainsi le modèle
  // sait *qu'il a* la position et peut répondre directement à "où suis-je"
  // sans déclencher de tool.
  const systemMessages: { role: "system"; content: string }[] = [
    { role: "system", content: JARVIS_SYSTEM_PROMPT },
  ];
  if (ctx.userLocation) {
    const { lat, lng } = ctx.userLocation;
    systemMessages.push({
      role: "system",
      content: `CONTEXTE TEMPS RÉEL : la position GPS actuelle de l'utilisateur est lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}. Tu peux y faire référence directement (ville, quartier, "ici", "près de toi") sans demander confirmation. Pour les recherches de POI, utilise l'outil find_nearby qui utilisera cette position automatiquement. Pour répondre à "où suis-je", tu peux donner les coordonnées brutes ou inverse-géocoder mentalement si tu reconnais la zone.`,
    });
  }

  const res = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 4096,
        tools: JARVIS_TOOLS,
        messages: [...systemMessages, ...toApiMessages(messages)],
      }),
    },
  );

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${errText || "réponse vide"}`);
  }

  return res.body;
}
