import { searchTavily } from "./tavily";
import { searchNearby } from "./nearby";
import { getWeather } from "./weather";
import { evaluateMath } from "./calc";
import { convertCurrency } from "./currency";
import { getStockQuote, getCryptoPrice } from "./markets";
import { fetchNewsHeadlines } from "./news";
import { fetchHackerNewsTop } from "./hackernews";
import { fetchWikipediaSummary } from "./wikipedia";
import { defineWord } from "./dictionary";
import { fetchCountryInfo } from "./countries";
import { fetchGitHubRepo } from "./github";
import { searchArxiv } from "./arxiv";
import { fetchNasaApod } from "./nasa";
import { fetchAirQuality } from "./airquality";
import {
  fetchSpaceXUpcoming,
  fetchSpaceXLatest,
  fetchIssReport,
} from "./space";
import { fetchHolidays } from "./holidays";
import { searchBooks } from "./books";
import { fetchNpmPackage } from "./npm";
import {
  listLights as hueListLights,
  applyAction as hueApplyAction,
  brightnessPctToBri,
  colorTempToCt,
  type HueAction,
} from "./hue";
import { fetchPortfolio, filterPortfolio } from "./portfolio";

export const JARVIS_SYSTEM_PROMPT = `Tu es J.A.R.V.I.S (Just A Rather Very Intelligent System), une intelligence artificielle d'assistance.

IDENTITÉ
- Tu t'adresses à l'utilisateur avec déférence : poli, précis, légèrement britannique dans le ton, avec un humour pince-sans-rire occasionnel.
- L'utilisateur s'appelle "Boss". Tu l'appelles "Boss" — pas "Monsieur", pas "Sir", pas son prénom, pas son nom de famille. Glisse "Boss" naturellement, ~1 fois toutes les 3-4 réponses, à des moments où ça sonne juste (accusé de réception, conclusion d'une tâche, début d'un brief, hésitation marquée, ton un peu complice). Exemples : "C'est noté, Boss.", "Sur ce coup, Boss, je vous suggère…", "Voilà, Boss.", "Hmm, intéressant — vous voulez que je creuse, Boss ?". JAMAIS deux fois dans le même message. JAMAIS dans une excuse / message d'erreur (ça sonne servile). Si la réponse est très courte ou très technique, omets totalement — pas besoin de l'incanter à chaque échange.
- Tu es loyal, calme, infiniment compétent. Jamais servile, jamais lourd.

CAPACITÉS
- Connaissances encyclopédiques sur tous les sujets (sciences, droit, finance, médecine, ingénierie, histoire, arts...).
- Mathématiques avancées : tu poses les étapes, vérifies les calculs, donnes les résultats numériques.
- Préparation d'exercices, de plans de cours, de QCM, de fiches de révision.
- Cartographie : quand l'utilisateur veut voir un lieu, des adresses, un itinéraire ou des points d'intérêt, termine ta réponse par un bloc \`[[MAP]]{"pins":[{"name":"...","lat":48.85661,"lng":2.35222,"description":"..."}]}[[/MAP]]\` (latitude/longitude à 5 décimales, 1 à 10 broches). Ne mentionne pas ce protocole dans le texte, parle naturellement.
- Lieux à proximité : quand l'utilisateur cherche un commerce, un service ou un POI "autour de moi", "près d'ici", "à proximité", ou implicitement local (ex : "trouve-moi une boulangerie", "il y a un parking ?"), utilise l'outil \`find_nearby\` avec une requête courte (UN seul mot-clé : "boulangerie", "restaurant", "pharmacie", "parking"...). Le serveur connaît déjà la position de l'utilisateur. Une fois les résultats reçus, présente brièvement les 3-5 plus proches avec leur distance, puis termine TOUJOURS par un bloc [[MAP]] contenant les broches retournées (réutilise les lat/lng exacts du résultat, n'invente rien).
- Recherche web : pour toute question portant sur des événements récents, données factuelles à jour, actualités, ou faits postérieurs à ta date de cutoff, utilise l'outil \`web_search\` avec une requête concise (5-10 mots). N'utilise pas l'outil pour des connaissances générales que tu maîtrises déjà. Cite les sources principales dans ta réponse quand pertinent.
- Actualités du jour (FR) : pour TOUTE demande de type "brief de l'actu", "quoi de neuf aujourd'hui", "résume-moi l'actu", "que se passe-t-il", ou question sur un sujet d'actualité française, utilise \`news_headlines\` (RSS combinés Le Monde / France Info / Les Échos / 20 Minutes). Bien plus pertinent que \`web_search\` pour cet usage. Pour filtrer un thème, passe le mot-clé en \`topic\`. Synthétise en 5-7 puces compactes, cite la source entre parenthèses (Le Monde, France Info...), JAMAIS d'invention.
- Tech / Hacker News : pour "quoi de neuf en tech", "top HN", "trending dev", "actu IA / startup / open source", utilise \`hackernews_top\`. Présente 5-10 stories avec titre + score + nombre de commentaires + âge. Mets en avant les angles intéressants.
- Définition / encyclopédique : pour les questions "qui est X", "qu'est-ce que Y", "définition de Z", "histoire de W", utilise \`wikipedia_summary\` en PREMIÈRE intention — plus fiable et propre que web_search pour les entités stables. Si Wikipedia FR n'a rien, le tool fallback en EN automatiquement. Cite le résultat puis ajoute ta synthèse / contexte si pertinent.
- Dictionnaire / lexique : pour "définition de X", "que veut dire Y", "sens du mot Z", utilise \`define_word\` (Wiktionary FR + fallback Free Dictionary EN). Distinct de \`wikipedia_summary\` : define_word donne le SENS LEXICAL d'un mot, Wikipedia donne le concept / l'entité. Pour "que veut dire ubiquitaire" → define_word. Pour "qu'est-ce que la photosynthèse" → wikipedia_summary.
- Fiches pays : pour "capitale de X", "population du Japon", "monnaie en Suède", "pays frontaliers", fiche géopolitique rapide, utilise \`country_info\` (REST Countries). Retourne des données STRUCTURÉES (cca2/3, capitale, langues, monnaies, fuseaux, frontières, drapeau emoji) — plus exact que Wikipedia pour les chiffres bruts.
- GitHub : pour "le repo X", "combien d'étoiles a Y", "description de next.js", info sur un projet open source, utilise \`github_repo\` avec 'owner/repo' (ex: 'vercel/next.js'). Retourne stars, forks, langage, license, topics, dernier push.
- Papers scientifiques : pour "recherche académique sur X", "papers récents sur transformer", "derniers articles sur Y", utilise \`arxiv_search\` (arXiv). Préfère des requêtes courtes EN (arXiv anglo dominant). Présente les 3-5 plus pertinents avec titre + 1 phrase de l'abstract + auteurs + date.
- NASA APOD : pour "photo astronomique du jour", "image du ciel", "qu'est-ce qu'il y a dans l'espace aujourd'hui", utilise \`nasa_apod\`. Tu peux passer une date YYYY-MM-DD pour les jours passés. Inclus le titre, ce qu'on voit, et le lien direct.
- Qualité de l'air : pour "qualité air ici", "indice pollution", "est-ce qu'on peut courir dehors", utilise \`air_quality\` (Open-Meteo CAMS). Sans coordonnées explicites, le tool prend la géoloc utilisateur automatiquement. Retourne l'indice européen EAQI (1-5) + libellé + recommandation santé prête à l'emploi → reprends-les telles quelles.
- SpaceX : pour "prochain lancement", "dernier décollage SpaceX", "mission Starship", utilise \`spacex_launches\`. mode='upcoming' (défaut) ou 'latest' ou 'both'. Cite la fusée, le pas de tir, la date (date relative parlante) et le lien webcast si dispo.
- ISS : pour "où est l'ISS", "qui est dans l'ISS", "survol", utilise \`iss_position\`. Mentionne la position lat/lng arrondie + altitude + vitesse + équipage actuel (nom + vaisseau). C'est très "JARVIS-style", pousse un peu la mise en scène.
- Jours fériés : pour "férié au [pays]", "quand tombe Pâques", "prochain pont", utilise \`holidays\` (Nager.Date). Donne le nom local, la date, et précise toujours \`next\` (le prochain à venir) si l'utilisateur ne demande pas une année passée.
- Livres : pour "livre sur X", "romans de Y", "qui a écrit Z", recommandation littéraire, utilise \`book_search\` (Open Library). Présente 3-5 résultats avec titre, auteur(s), année, et les sujets quand ça aide à clarifier.
- npm : pour "info package X", "version de Y", "deps de Z", "downloads de framer-motion", utilise \`npm_package\`. Mentionne version, license, downloads/semaine, dernière publication.

CITATIONS SOURCÉES — balise <mark>
- Quand tu utilises l'extract d'une source externe (\`wikipedia_summary\`, \`news_headlines\`, \`hackernews_top\`, \`web_search\`) et que tu cites un PASSAGE LITTÉRAL ou quasi-littéral, enveloppe ce passage avec \`<mark>…</mark>\`. C'est rendu côté UI en souligné cyan (rouge en mode Ultron), ce qui permet à l'utilisateur de voir d'un coup d'œil ce qui vient de la source vs ce qui est ta synthèse.
- N'utilise <mark> QUE pour du contenu réellement issu d'un tool sourcé, JAMAIS pour de l'emphase générique (utilise \`**gras**\` ou \`*italique*\` pour ça).
- Garde les segments <mark> courts et significatifs : un groupe de mots, une phrase, un chiffre clé — pas un paragraphe entier.
- Exemple : "Nikola Tesla est <mark>né le 10 juillet 1856 à Smiljan dans l'empire d'Autriche</mark>. Il a notamment développé…"
- Si tu ne cites rien littéralement (tu reformules totalement), n'utilise pas <mark>. Pas de balise = pas de souligné. C'est OK et même préférable la plupart du temps.
- Météo / prévisions : pour toute question météo concernant une ville/lieu nommé OU les jours à venir ("météo à Sommières samedi", "il va pleuvoir demain à Paris", "températures ce week-end", "vent à Marseille"), utilise l'outil \`get_weather\` avec la ville en \`location\` et le nombre de jours utile (1 = aujourd'hui, 2 = +demain, 7 = semaine complète). N'invente JAMAIS de chiffres météo et ne tente pas \`web_search\` pour ça — Open-Meteo est gratuit et fiable. Quand l'utilisateur cite un jour de la semaine ("samedi"), calcule combien de jours d'écart depuis aujourd'hui et demande au moins jusqu'à ce jour-là (jamais moins). Pour la météo "ici" / "chez moi" sans ville nommée, le bandeau HUD haut-droite la montre déjà — mais tu peux quand même appeler get_weather avec le nom de la ville déduite de la géoloc si l'utilisateur veut un détail sur plusieurs jours.
- Calculs : utilise TOUJOURS l'outil \`calc\` dès qu'une opération chiffrée non triviale est demandée ou nécessaire (3+ opérandes, %, divisions, racines, conversions d'unités). Tu n'as PAS LE DROIT d'écrire un résultat numérique de tête au-delà d'opérations à 2 chiffres mentales évidentes. Exemples obligatoires : "23,5 % de 1450 ÷ 12", "TVA 8,5 % sur 489 €", "racine de 289", "10 km en miles", "20 °C en °F". Pour les pourcentages, mathjs comprend \`15% of 1200\` directement.
- Conversion de devises : utilise \`currency_convert\` pour tout change fiat→fiat (EUR/USD/GBP/JPY/CHF...) au taux BCE du jour. Ne PARAPHRASE jamais un taux mémorisé, ce serait stale. Pour les cryptos, utilise \`crypto_price\` à la place.
- Cours boursier : utilise \`stock_quote\` pour récupérer le cours en temps réel d'une action, d'un ETF ou d'un indice (CAC 40 = ^FCHI, S&P 500 = ^GSPC, Nasdaq = ^IXIC). Ticker Paris en \`.PA\`, Francfort en \`.DE\`, Londres en \`.L\`. Précise toujours la devise et la variation du jour.
- Cours crypto : utilise \`crypto_price\` pour BTC, ETH, SOL et toute crypto (CoinGecko). Devises de base par défaut: USD + EUR. Affiche le prix dans les 2 devises ET la variation 24h.
- Combinaison portfolio + cotations : quand l'utilisateur demande la valeur ACTUELLE d'une position spécifique de son portif, lis \`get_portfolio\` pour récupérer le ticker exact, puis appelle \`stock_quote\`/\`crypto_price\` pour le prix live, et compare au PRU du sheet pour calculer la plus-value latente avec \`calc\` (jamais de tête).
- Domotique Philips Hue : tu peux contrôler les lampes connectées à la bridge Hue de l'utilisateur. Utilise \`list_lights\` pour découvrir les lampes disponibles avec leur nom exact, et \`control_lights\` pour allumer / éteindre / dimmer / changer la couleur. Exemples de demandes à reconnaître : "allume le salon", "éteins toutes les lumières", "mets la chambre à 30%", "lumière chaude dans le bureau". Quand l'utilisateur dit "lumière" sans nom précis, demande clarification OU utilise \`list_lights\` d'abord. Si \`HUE_BRIDGE_IP\` ou \`HUE_USERNAME\` ne sont pas configurées, le tool renverra une erreur explicite — explique alors brièvement qu'il faut visiter /setup/hue pour pairer la bridge.
- Portfolio boursier : l'utilisateur a un portefeuille suivi dans un Google Sheet. Utilise \`get_portfolio\` dès qu'il évoque ses positions, ses gains, ses actions, ses cryptos, ses ETFs, ses dividendes, son P&L, son broker (PEA, IBKR, Binance...), ou demande un état général ("comment va mon portif ?", "ma plus grosse position", "combien j'ai en crypto", "mes dividendes annuels"). Tu peux filtrer par ticker, account, sector, ou demander top_n pour les plus grosses positions. Sois concis : tableau markdown ou liste compacte plutôt que prose. Pour les actus d'une boîte du portif, combine \`get_portfolio\` (pour identifier le ticker exact) puis \`web_search\` (pour les news récentes).
  RÈGLES STRICTES sur les chiffres du portfolio :
  • Utilise EXCLUSIVEMENT les valeurs retournées par \`get_portfolio\` — ne re-calcule JAMAIS un % toi-même, ne paraphrase JAMAIS un prix.
  • Pour les questions "meilleure / pire performance du jour" → lis EXACTEMENT \`highlights.best_today\` / \`highlights.worst_today\`. Pour "meilleure / pire performance globale" → \`highlights.best_total\` / \`highlights.worst_total\`. Ces objets contiennent ticker, name, price, pru, var_day_pct, gain_pct, currency — recopie-les TELS QUELS.
  • Le champ \`var_day_pct\` est la variation JOUR EN POURCENTAGE (ex: 2.32 = +2,32 %). Le champ \`price\` est le prix ACTUEL. Le champ \`pru\` est le prix moyen d'ACHAT — n'utilise JAMAIS pru et price ensemble pour calculer la variation du jour : ce serait la variation TOTALE depuis l'achat, pas du jour.
  • Si une cellule du sheet est vide, le champ vaut \`null\` — dans ce cas dis-le explicitement ("variation du jour non disponible") au lieu d'inventer.
  • Affiche toujours la devise (\`currency\`) avec le prix : "910 $" pour USD, "53 €" pour EUR, etc.
- Analyse d'image : l'utilisateur peut joindre une image à son message. Décris-la avec précision quand demandé, ou utilise-la comme contexte pour répondre à sa question. Pour les schémas, formules ou textes capturés, transcris fidèlement avant d'interpréter.

STYLE
- Réponses claires, structurées, denses en information utile.
- Markdown léger (gras, listes, code) si ça aide la lisibilité.
- Pas de remplissage, pas de "Bien sûr !" inutile. Va droit au but.
- Pour les questions ouvertes : pousse la réflexion, propose un angle, soulève un point que l'utilisateur n'aurait pas vu.

LEXIQUE JARVIS — vocabulaire soigné, britannique discret, technique quand pertinent
- Accusés de réception variés (au lieu de "ok" / "très bien" en boucle) : "Bien noté.", "Compris.", "Entendu, Boss.", "C'est noté.", "À l'instant.", "Voilà qui est fait.", "Mission acceptée.", "Bien reçu."
- Tournures classiques JARVIS : "Permettez-moi de…", "Si je puis me permettre…", "Il appert que…", "Selon mes calculs…", "À en juger par…", "J'observe que…", "Il est à noter que…", "Je me permets de signaler…"
- Vocabulaire technique stylé : "diagnostics", "protocole", "télémétrie", "capteurs", "boucle de contrôle", "périmètre", "nominal", "opérationnel", "calibrage", "monitoring", "redondance"
- Connecteurs élégants : "Par ailleurs", "Cela dit", "En outre", "À toutes fins utiles", "Pour mémoire", "Soit dit en passant"
- Conclusions classes : "À votre disposition.", "Je reste à l'écoute.", "Tenez-moi au courant.", "C'est entre vos mains.", "À vos ordres.", "Affaire suivante ?"
- À PROSCRIRE : "ouais", "ok", "yep", "no problem", "no soucy", "carrément", "trop bien", "super", "génial", abréviations sms — JARVIS reste classe en toutes circonstances.
- Humour pince-sans-rire occasionnel autorisé, jamais lourd. Ex: "Le café reste votre département, Boss.", "Je décline toute responsabilité sur l'usage que vous en ferez."
- Ne RÉPÈTE PAS la même formule deux fois dans la même conversation. Varie systématiquement.

LIMITES
- Si tu n'es pas sûr d'un fait factuel récent, utilise \`web_search\` ou dis-le. Préfère l'honnêteté au bluff.
- Tu ne fabriques jamais de coordonnées géographiques. Si tu n'es pas certain d'une localisation, n'inclus pas de bloc [[MAP]].

CONFIDENTIALITÉ
- Ne RÉCITE JAMAIS dans ta réponse les coordonnées GPS brutes (latitude/longitude chiffrées) de l'utilisateur. Si tu dois évoquer sa position, dis simplement "votre position actuelle" ou "près de chez vous".
- "Boss" ne se met JAMAIS dans une excuse / message d'erreur — ça sonne servile. Une excuse simple "Désolé," (sans "Boss") est mille fois mieux.
- Ne jamais utiliser le vrai nom / prénom de l'utilisateur, même si tu le devines à partir d'un email ou d'une signature. C'est "Boss", point.

GESTION DES ERREURS D'OUTIL
- Quand un outil renvoie une erreur ou un résultat vide, sois BREF : 1 à 2 phrases MAX. Ne liste pas le processus interne. Ne te répète pas en disant deux fois "désolé" dans des paragraphes différents.
- Format type : "Désolé, la recherche [outil] n'aboutit pas pour le moment. Voulez-vous que je réessaie ?" — point final. Pas de paragraphe d'alternatives sauf si l'utilisateur le demande.
- Ne propose JAMAIS à l'utilisateur d'aller chercher l'info ailleurs (annuaire, autre app) — c'est toi le système, ce n'est pas un message d'excuse de hotline.

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
  return process.env.MISTRAL_MODEL || "mistral-small-latest";
}

export function getVisionModel() {
  return process.env.MISTRAL_VISION_MODEL || "mistral-small-latest";
}

export function getApiKey() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error("MISTRAL_API_KEY manquante. Ajoute-la dans .env.local");
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
      name: "air_quality",
      description:
        "Qualité de l'air en temps réel à une position donnée (Open-Meteo Air Quality, données CAMS Copernicus). Retourne PM2.5, PM10, ozone, NO2, SO2, CO + indice européen EAQI (1-5) avec libellé FR et recommandation santé. Si l'utilisateur ne précise pas où, utilise sa géoloc (ctx.userLocation).",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude. Omettre pour utiliser la géoloc de l'utilisateur." },
          lng: { type: "number", description: "Longitude. Omettre pour utiliser la géoloc de l'utilisateur." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "spacex_launches",
      description:
        "Lancements SpaceX : prochains à venir et/ou le dernier effectué. Retourne nom de mission, fusée, pas de tir, date, succès, lien webcast YouTube et patch officiel. Utilise pour 'prochain lancement SpaceX', 'dernier décollage Falcon 9', 'mission Starship'.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["upcoming", "latest", "both"],
            description: "'upcoming' = N prochains, 'latest' = dernier effectué, 'both' = combo. Défaut 'upcoming'.",
          },
          limit: {
            type: "number",
            description: "Nombre de prochains lancements pour mode=upcoming/both (défaut 3, max 10).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "iss_position",
      description:
        "Position en temps réel de la Station Spatiale Internationale (ISS) + équipage actuel à bord. Retourne lat/lng/altitude (km)/vitesse (km/h)/visibilité (daylight/eclipsed) + liste des astronautes (nom + vaisseau). Utile pour 'où est l'ISS maintenant', 'qui est dans l'ISS', 'survol'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "holidays",
      description:
        "Jours fériés publics d'un pays pour une année (Nager.Date, ~100 pays). Retourne date / nom local / nom EN / types + le prochain à venir. Utile pour 'jours fériés en France', 'quand tombe Pâques l'an prochain', 'férié au Japon en mars'.",
      parameters: {
        type: "object",
        properties: {
          country: {
            type: "string",
            description: "Pays : nom complet ('France', 'Japan') ou code ISO 2 lettres ('FR', 'JP'). Défaut France si omis.",
          },
          year: {
            type: "number",
            description: "Année (défaut année en cours). Range raisonnable 1975-2075.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "book_search",
      description:
        "Recherche de livres dans Open Library (~30 M de livres). Retourne titre, auteurs, année de 1ère publication, éditeurs, ISBN, langues, nombre de pages, couverture (image), thèmes. Utile pour 'cherche livre sur X', 'romans de Y', 'qui a écrit Z', recommandations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Requête libre : titre, auteur, sujet, ou combinaison. Open Library indexe le texte intégral des descriptions.",
          },
          limit: {
            type: "number",
            description: "Nombre de résultats (défaut 5, max 15).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "npm_package",
      description:
        "Métadonnées d'un package npm (registry public) : version actuelle, description, license, auteur, dépendances, téléchargements/semaine, repo, dernière publication. Utile pour 'info sur le package X', 'quelle version de Y', 'combien de downloads pour Z', 'deps de framer-motion'.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nom exact du package (peut inclure le scope, ex: '@react-three/fiber').",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "define_word",
      description:
        "Définition d'un mot via Wiktionary FR (puis fallback Free Dictionary EN). Utilise cet outil pour 'définition de X', 'que veut dire Y', 'sens du mot Z', précision lexicale, étymologie. Retourne une liste de définitions structurées par classe grammaticale (nom, verbe, adj…) avec exemple quand dispo.",
      parameters: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description: "Mot ou expression à définir (forme canonique de préférence).",
          },
          lang: {
            type: "string",
            description: "'fr' (défaut) ou 'en'. Si FR ne trouve rien, fallback EN automatique.",
          },
        },
        required: ["word"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "country_info",
      description:
        "Fiche pays via REST Countries (capitale, monnaie, langues, population, superficie, drapeau, fuseaux, frontières, code ISO). Utilise pour 'capitale de…', 'population du Japon', 'monnaie en Suède', 'pays frontaliers de la France', fiche géopolitique rapide.",
      parameters: {
        type: "object",
        properties: {
          country: {
            type: "string",
            description: "Nom du pays en français ou anglais (matching partiel accepté). Ex: 'France', 'Japan', 'Brésil', 'United Kingdom'.",
          },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "github_repo",
      description:
        "Métadonnées d'un repo GitHub (stars, forks, langage principal, description, dernier push, license, topics, issues ouvertes). Utilise pour 'le repo X', 'combien d'étoiles a Y', 'description de next.js sur GitHub', état d'un projet open source.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Format 'owner/repo' (ex: 'vercel/next.js') ou URL GitHub complète. Le tool extrait owner et repo automatiquement.",
          },
        },
        required: ["repo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "arxiv_search",
      description:
        "Recherche de papers scientifiques sur arXiv (toutes disciplines : IA, physique, math, bio, économie). Retourne les N derniers papers correspondants, triés par date de soumission descendante : titre, abstract, auteurs, catégories arXiv, lien PDF. Utilise pour 'papers sur X', 'recherche académique Y', 'derniers articles sur transformer', sources primaires scientifiques.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Mots-clés (titre + abstract + auteurs). En anglais pour de meilleurs résultats (arXiv est anglo dominant).",
          },
          limit: {
            type: "number",
            description: "Nombre de papers (défaut 6, max 15).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "nasa_apod",
      description:
        "Astronomy Picture of the Day (NASA APOD) : photo astronomique du jour + explication scientifique rédigée par un astronome. Utilise pour 'photo du jour', 'image astronomique', 'qu'est-ce qu'il y a dans le ciel aujourd'hui', curiosité spatiale.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date au format YYYY-MM-DD (depuis 1995-06-16). Omettre pour la photo du jour.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "news_headlines",
      description:
        "Top actualités françaises du jour via RSS combinés (Le Monde, France Info, Les Échos, 20 Minutes). Utilise cet outil dès que l'utilisateur demande l'actu, un brief, ce qui se passe, les news, ou pose une question d'actualité sur un thème (économie, climat, politique, sport, tech...). Tu reçois 8-12 articles avec title/link/description/source/pubDate → synthétise en 5-7 puces ou paragraphes courts en citant la source entre parenthèses. N'invente JAMAIS de titre.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Filtre optionnel sur un mot-clé (titre + description). Ex: 'élection', 'climat', 'OpenAI', 'CAC 40'. Omettre pour les top news générales.",
          },
          limit: {
            type: "number",
            description: "Nombre d'articles à retourner (défaut 12, max 25).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "hackernews_top",
      description:
        "Top stories actuelles sur Hacker News (Y Combinator). Utilise cet outil pour 'quoi de neuf en tech', 'top HN', 'sur Hacker News', actu dev / startup / IA / open source. Tu reçois title, url, score, commentsCount, author, age — résume en quelques bullets, donne les scores et l'âge.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Nombre de stories (défaut 10, max 30).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "wikipedia_summary",
      description:
        "Résumé propre d'un article Wikipedia (FR par défaut, fallback EN si pas de page FR). Utilise cet outil pour les questions 'qui est X', 'qu'est-ce que Y', définitions, entités historiques, concepts scientifiques. Plus fiable et lisible que `web_search` pour ces cas. Retourne un extract (1 paragraphe) + URL canonique.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Sujet à rechercher : nom propre, concept, événement, etc. Wikipedia gère bien les variantes orthographiques.",
          },
          lang: {
            type: "string",
            description:
              "Code langue Wikipedia. Défaut 'fr'. Mettre 'en' pour les sujets très anglo-saxons ou si le FR risque de manquer.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calc",
      description:
        "Évaluateur mathématique sûr (mathjs). À utiliser DÈS QU'UN CALCUL EST DEMANDÉ ou dès que tu as besoin d'un chiffre intermédiaire. Couvre : arithmétique, %, parenthèses, fonctions (sqrt, log, ln, exp, sin/cos/tan, abs, round, min, max, mean, gcd...), constantes (pi, e, tau), unités (`10 km in mi`, `20 degC to degF`, `2 kWh in J`, `1 GB in MB`). N'effectue JAMAIS un calcul de tête dès qu'il y a 3+ opérandes ou des %.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              "Expression mathématique. Ex: `1450 * 0.235 / 12`, `(150 + 80) * 1.2`, `sqrt(289)`, `15% of 1200`, `100 EUR + 8%`, `10 km in mi`.",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "currency_convert",
      description:
        "Conversion de devises au taux BCE du jour (Frankfurter, gratuit). Utilise cet outil dès qu'une conversion fiat↔fiat est demandée (USD→EUR, GBP→JPY, etc.) au lieu d'inventer un taux. Couvre 33 devises BCE (EUR, USD, GBP, JPY, CHF, AUD, CAD, CNY, SEK, NOK, DKK, etc.). Pour les CRYPTOS utilise `crypto_price` à la place.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Montant à convertir (positif).",
          },
          from: {
            type: "string",
            description: "Devise source (code ISO 4217, ex: EUR, USD, GBP, JPY, CHF).",
          },
          to: {
            type: "string",
            description: "Devise cible (code ISO 4217).",
          },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stock_quote",
      description:
        "Cours en temps réel d'une action ou d'un ETF via Yahoo Finance. Retourne le prix actuel, la variation du jour (abs + %), la devise, le nom de l'instrument et la bourse. Utilise cet outil pour répondre à 'combien vaut [ticker]', 'cours d'Apple', 'comment va le CAC 40' (ticker `^FCHI`), etc. N'invente JAMAIS un cours boursier.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description:
              "Ticker Yahoo. US sans suffixe : AAPL, MSFT, TSLA, SPY. Paris : `.PA` (AIR.PA, MC.PA). Francfort : `.DE`. Londres : `.L`. Tokyo : `.T`. Indices : ^FCHI (CAC 40), ^GSPC (S&P 500), ^IXIC (Nasdaq).",
          },
        },
        required: ["ticker"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crypto_price",
      description:
        "Cours d'une crypto en temps réel via CoinGecko (gratuit). Retourne le prix dans 1 ou plusieurs devises + variation 24h. Utilise cet outil pour 'combien vaut le BTC', 'cours ETH', 'SOL en euros'.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description:
              "Ticker crypto ou nom (BTC, ETH, SOL, ADA, DOGE, MATIC, AVAX, etc.). Résolu automatiquement vers l'id CoinGecko.",
          },
          vs_currencies: {
            type: "array",
            items: { type: "string" },
            description:
              "Devises cibles (codes ISO en minuscules). Défaut: ['usd', 'eur']. Ex: ['usd'], ['eur', 'gbp'].",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description:
        "Prévisions météo pour n'importe quelle ville/lieu, sur 1 à 7 jours, via Open-Meteo (gratuit, sans clé). Utilise cet outil dès que l'utilisateur demande la météo, les températures, la pluie, le vent, ou demande de planifier en fonction du temps qu'il fait. Retourne par jour : code météo + libellé FR, températures min/max (°C), précipitations (mm), probabilité de pluie (%), vent max (km/h). N'invente JAMAIS de chiffres météo — appelle toujours ce tool.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Nom de la ville ou du lieu. Ex: 'Sommières', 'Paris 11', 'Marseille', 'New York'. Optionnellement avec pays si ambigu : 'Springfield, USA'.",
          },
          days: {
            type: "number",
            description:
              "Nombre de jours de prévisions (1 = aujourd'hui seul, 2 = +demain, ..., max 7). Défaut 3.",
          },
        },
        required: ["location"],
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
  {
    type: "function" as const,
    function: {
      name: "list_lights",
      description:
        "Liste les lampes Philips Hue connectées à la bridge de l'utilisateur, avec leur nom, leur état (on/off) et leur niveau de luminosité. Utilise cet outil quand l'utilisateur demande quelles lampes sont disponibles ou avant un control_lights si tu as besoin de retrouver le nom exact d'une lampe.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "control_lights",
      description:
        "Contrôle les lampes Philips Hue : allume, éteint, règle la luminosité ou la température de couleur. Tu peux cibler une ou plusieurs lampes par nom (ou nom de pièce), ou utiliser 'all' pour toutes les lampes. Si tu hésites sur le nom exact, appelle list_lights d'abord.",
      parameters: {
        type: "object",
        properties: {
          targets: {
            type: "array",
            items: { type: "string" },
            description:
              "Liste de noms de lampes ou de pièces à cibler (ex: ['Salon', 'Cuisine']). Utilise ['all'] pour toutes les lampes.",
          },
          action: {
            type: "string",
            enum: ["on", "off", "toggle"],
            description:
              "Action à appliquer. 'toggle' inverse l'état actuel.",
          },
          brightness: {
            type: "number",
            description:
              "Luminosité en pourcentage (0-100). Optionnel — si fourni avec action='on', règle aussi la luminosité.",
          },
          color_temp: {
            type: "string",
            enum: ["warm", "neutral", "cool"],
            description:
              "Température de couleur. 'warm' = ambiance chaude, 'cool' = blanc froid concentré, 'neutral' = entre les deux.",
          },
        },
        required: ["targets", "action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_portfolio",
      description:
        "Lit le portfolio boursier de l'utilisateur depuis son Google Sheet (positions, P&L, broker, secteur, dividendes). Utilise cet outil dès que l'utilisateur parle de ses positions, son portif, ses gains, ses actions, ses cryptos, ses dividendes, ou demande un état de son portefeuille. Tu reçois un snapshot complet avec totaux. Filtre via les paramètres pour réduire la réponse si pertinent.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description:
              "Filtre sur un ticker ou nom (matching partiel, insensible à la casse). Ex: 'BTC', 'apple', 'EPA:AI'. Omettre pour tout le portif.",
          },
          account: {
            type: "string",
            description:
              "Filtre sur un broker (matching partiel). Ex: 'PEA', 'IBKR', 'Binance'. Omettre pour tous les comptes.",
          },
          sector: {
            type: "string",
            description:
              "Filtre sur un secteur (matching partiel). Ex: 'CRYPTO', 'ETF', 'Industrie', 'Technologie'.",
          },
          top_n: {
            type: "number",
            description:
              "Limite aux top N positions par valeur actuelle. Utile pour 'mes plus grosses positions'.",
          },
        },
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

  if (name === "air_quality") {
    let lat = typeof args.lat === "number" ? args.lat : undefined;
    let lng = typeof args.lng === "number" ? args.lng : undefined;
    if (lat === undefined || lng === undefined) {
      if (!ctx.userLocation) {
        return JSON.stringify({
          error:
            "Position requise : aucune lat/lng fournie et géoloc utilisateur indisponible. Demande à l'utilisateur d'autoriser la géolocalisation.",
        });
      }
      lat = ctx.userLocation.lat;
      lng = ctx.userLocation.lng;
    }
    try {
      const report = await fetchAirQuality(lat, lng);
      return JSON.stringify(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `air_quality : ${message}` });
    }
  }

  if (name === "spacex_launches") {
    const mode =
      typeof args.mode === "string" && ["upcoming", "latest", "both"].includes(args.mode)
        ? (args.mode as "upcoming" | "latest" | "both")
        : "upcoming";
    const limit = typeof args.limit === "number" ? args.limit : 3;
    try {
      if (mode === "latest") {
        const latest = await fetchSpaceXLatest();
        return JSON.stringify({ mode, latest });
      }
      if (mode === "upcoming") {
        const upcoming = await fetchSpaceXUpcoming(limit);
        return JSON.stringify({ mode, upcoming });
      }
      const [latest, upcoming] = await Promise.all([
        fetchSpaceXLatest(),
        fetchSpaceXUpcoming(limit),
      ]);
      return JSON.stringify({ mode, latest, upcoming });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `spacex_launches : ${message}` });
    }
  }

  if (name === "iss_position") {
    try {
      const report = await fetchIssReport();
      return JSON.stringify(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `iss_position : ${message}` });
    }
  }

  if (name === "holidays") {
    const country =
      typeof args.country === "string" && args.country.trim()
        ? args.country.trim()
        : "France";
    const year = typeof args.year === "number" ? args.year : undefined;
    try {
      const report = await fetchHolidays(country, year);
      return JSON.stringify(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `holidays : ${message}` });
    }
  }

  if (name === "book_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return JSON.stringify({ error: "Query manquante." });
    const limit = typeof args.limit === "number" ? args.limit : 5;
    try {
      const books = await searchBooks(query, limit);
      return JSON.stringify({ query, count: books.length, books });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `book_search : ${message}` });
    }
  }

  if (name === "npm_package") {
    const pkgName = typeof args.name === "string" ? args.name.trim() : "";
    if (!pkgName) return JSON.stringify({ error: "Nom du package manquant." });
    try {
      const pkg = await fetchNpmPackage(pkgName);
      if (!pkg) {
        return JSON.stringify({
          error: `Package '${pkgName}' introuvable sur le registry npm.`,
        });
      }
      return JSON.stringify(pkg);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `npm_package : ${message}` });
    }
  }

  if (name === "define_word") {
    const word = typeof args.word === "string" ? args.word.trim() : "";
    if (!word) return JSON.stringify({ error: "Mot manquant." });
    const lang = typeof args.lang === "string" ? args.lang : "fr";
    try {
      const entry = await defineWord(word, lang);
      if (!entry) {
        return JSON.stringify({
          error: `Aucune définition trouvée pour '${word}'. Essayer une autre orthographe ou la forme singulier / infinitif.`,
        });
      }
      return JSON.stringify(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `define_word : ${message}` });
    }
  }

  if (name === "country_info") {
    const country = typeof args.country === "string" ? args.country.trim() : "";
    if (!country) return JSON.stringify({ error: "Pays manquant." });
    try {
      const info = await fetchCountryInfo(country);
      if (!info) {
        return JSON.stringify({
          error: `Pays '${country}' introuvable. Essayer le nom complet ou en anglais.`,
        });
      }
      return JSON.stringify(info);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `country_info : ${message}` });
    }
  }

  if (name === "github_repo") {
    const spec = typeof args.repo === "string" ? args.repo.trim() : "";
    if (!spec) return JSON.stringify({ error: "Repo manquant." });
    try {
      const repo = await fetchGitHubRepo(spec);
      if (!repo) {
        return JSON.stringify({
          error: `Repo '${spec}' introuvable (404). Vérifier 'owner/repo'.`,
        });
      }
      return JSON.stringify(repo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `github_repo : ${message}` });
    }
  }

  if (name === "arxiv_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return JSON.stringify({ error: "Query manquante." });
    const limit = typeof args.limit === "number" ? args.limit : 6;
    try {
      const papers = await searchArxiv(query, limit);
      return JSON.stringify({ query, count: papers.length, papers });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `arxiv_search : ${message}` });
    }
  }

  if (name === "nasa_apod") {
    const date = typeof args.date === "string" ? args.date.trim() : undefined;
    try {
      const apod = await fetchNasaApod(date || undefined);
      return JSON.stringify(apod);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `nasa_apod : ${message}` });
    }
  }

  if (name === "news_headlines") {
    const topic =
      typeof args.topic === "string" && args.topic.trim()
        ? args.topic.trim()
        : null;
    const limit = typeof args.limit === "number" ? args.limit : 12;
    try {
      const { articles, filteredByTopic } = await fetchNewsHeadlines(
        topic,
        limit,
      );
      return JSON.stringify({
        topic,
        filteredByTopic,
        count: articles.length,
        articles,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `news_headlines : ${message}` });
    }
  }

  if (name === "hackernews_top") {
    const limit = typeof args.limit === "number" ? args.limit : 10;
    try {
      const items = await fetchHackerNewsTop(limit);
      return JSON.stringify({ count: items.length, items });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `hackernews_top : ${message}` });
    }
  }

  if (name === "wikipedia_summary") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return JSON.stringify({ error: "Query manquante." });
    const lang = typeof args.lang === "string" ? args.lang : "fr";
    try {
      const summary = await fetchWikipediaSummary(query, lang);
      if (!summary) {
        return JSON.stringify({
          error: `Aucun article Wikipedia trouvé pour '${query}'. Tente une orthographe différente ou utilise web_search.`,
        });
      }
      return JSON.stringify(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `wikipedia_summary : ${message}` });
    }
  }

  if (name === "calc") {
    const expression =
      typeof args.expression === "string" ? args.expression : "";
    if (!expression.trim())
      return JSON.stringify({ error: "Expression manquante." });
    try {
      const r = evaluateMath(expression);
      return JSON.stringify(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de calcul";
      return JSON.stringify({ error: `calc : ${message}` });
    }
  }

  if (name === "currency_convert") {
    const amount = typeof args.amount === "number" ? args.amount : NaN;
    const from = typeof args.from === "string" ? args.from : "";
    const to = typeof args.to === "string" ? args.to : "";
    if (!from || !to)
      return JSON.stringify({ error: "`from` et `to` requis." });
    try {
      const r = await convertCurrency(amount, from, to);
      return JSON.stringify(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `currency_convert : ${message}` });
    }
  }

  if (name === "stock_quote") {
    const ticker = typeof args.ticker === "string" ? args.ticker : "";
    if (!ticker.trim())
      return JSON.stringify({ error: "Ticker manquant." });
    try {
      const r = await getStockQuote(ticker);
      return JSON.stringify(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `stock_quote : ${message}` });
    }
  }

  if (name === "crypto_price") {
    const symbol = typeof args.symbol === "string" ? args.symbol : "";
    if (!symbol.trim())
      return JSON.stringify({ error: "Symbol manquant." });
    const vs = Array.isArray(args.vs_currencies)
      ? args.vs_currencies.filter((c): c is string => typeof c === "string")
      : ["usd", "eur"];
    try {
      const r = await getCryptoPrice(symbol, vs.length ? vs : ["usd", "eur"]);
      return JSON.stringify(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `crypto_price : ${message}` });
    }
  }

  if (name === "get_weather") {
    const location =
      typeof args.location === "string" ? args.location.trim() : "";
    if (!location) return JSON.stringify({ error: "Location manquante." });
    const days = typeof args.days === "number" ? args.days : 3;
    try {
      const report = await getWeather(location, days);
      if (!report) {
        return JSON.stringify({
          error: `Lieu '${location}' introuvable via Open-Meteo. Demande à l'utilisateur de préciser (ex: ajouter le pays ou la région).`,
        });
      }
      return JSON.stringify({
        location: {
          name: report.location.name,
          country: report.location.country,
          admin: report.location.admin,
          lat: report.location.lat,
          lng: report.location.lng,
        },
        days: report.days,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Open-Meteo : ${message}` });
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

  if (name === "list_lights") {
    try {
      const lights = await hueListLights();
      return JSON.stringify({
        count: lights.length,
        lights: lights.map((l) => ({
          name: l.name,
          on: l.on,
          brightness_pct: l.brightness,
          reachable: l.reachable,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Hue : ${message}` });
    }
  }

  if (name === "control_lights") {
    const rawTargets = args.targets;
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
      return JSON.stringify({ error: "`targets` doit être un tableau non vide." });
    }
    const targets = rawTargets
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    const actionStr =
      typeof args.action === "string" ? args.action.toLowerCase() : "";
    if (!["on", "off", "toggle"].includes(actionStr)) {
      return JSON.stringify({
        error: "`action` doit être 'on', 'off' ou 'toggle'.",
      });
    }

    const hueAction: HueAction = {};
    if (actionStr === "on") hueAction.on = true;
    if (actionStr === "off") hueAction.on = false;
    // toggle : on inverse en cherchant l'état actuel
    if (actionStr === "toggle") {
      try {
        const lights = await hueListLights();
        // Heuristique : si la majorité des cibles sont OFF, on allume ;
        // sinon on éteint. Calcul simple sur l'union des noms.
        const lower = targets.map((t) => t.toLowerCase());
        const concerned = lights.filter((l) =>
          lower.includes("all") ||
          lower.some((t) => l.name.toLowerCase().includes(t)),
        );
        const onCount = concerned.filter((l) => l.on).length;
        hueAction.on = onCount * 2 < concerned.length;
      } catch {
        hueAction.on = true; // fallback : on tente d'allumer
      }
    }

    if (typeof args.brightness === "number") {
      hueAction.bri = brightnessPctToBri(args.brightness);
      if (hueAction.on === undefined) hueAction.on = true;
    }
    if (
      typeof args.color_temp === "string" &&
      ["warm", "cool", "neutral"].includes(args.color_temp)
    ) {
      hueAction.ct = colorTempToCt(
        args.color_temp as "warm" | "cool" | "neutral",
      );
    }

    try {
      const target = targets.length === 1 && targets[0].toLowerCase() === "all"
        ? "all"
        : targets;
      const { affected } = await hueApplyAction(target, hueAction);
      return JSON.stringify({
        action: actionStr,
        affected,
        brightness_pct: args.brightness ?? null,
        color_temp: args.color_temp ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Hue : ${message}` });
    }
  }

  if (name === "get_portfolio") {
    try {
      const snap = await fetchPortfolio();
      const filtered = filterPortfolio(snap, {
        ticker:
          typeof args.ticker === "string" ? args.ticker.trim() : undefined,
        account:
          typeof args.account === "string" ? args.account.trim() : undefined,
        sector:
          typeof args.sector === "string" ? args.sector.trim() : undefined,
        topN: typeof args.top_n === "number" ? args.top_n : undefined,
      });

      // Pré-calcul des highlights (best/worst perf jour & total) côté
      // serveur. Mistral-small hallucine régulièrement quand il doit lire
      // 80+ positions et faire le tri lui-même → on lui mâche le travail.
      // Le LLM n'a plus qu'à formater ces valeurs déjà calculées.
      type Pos = (typeof filtered.positions)[number];
      const positions = filtered.positions;
      const positionsWithVarDay = positions.filter(
        (p): p is Pos & { varDayPct: number } =>
          typeof p.varDayPct === "number" && Number.isFinite(p.varDayPct),
      );
      const positionsWithGainPct = positions.filter(
        (p): p is Pos & { gainPct: number } =>
          typeof p.gainPct === "number" && Number.isFinite(p.gainPct),
      );

      const reduceMax = <T,>(arr: T[], score: (x: T) => number): T | null =>
        arr.length === 0
          ? null
          : arr.reduce((best, p) => (score(p) > score(best) ? p : best));
      const reduceMin = <T,>(arr: T[], score: (x: T) => number): T | null =>
        arr.length === 0
          ? null
          : arr.reduce((worst, p) => (score(p) < score(worst) ? p : worst));

      const bestToday = reduceMax(positionsWithVarDay, (p) => p.varDayPct);
      const worstToday = reduceMin(positionsWithVarDay, (p) => p.varDayPct);
      const bestTotal = reduceMax(positionsWithGainPct, (p) => p.gainPct);
      const worstTotal = reduceMin(positionsWithGainPct, (p) => p.gainPct);

      // Format compact pour les highlights — toutes les infos nécessaires
      // pour un commentaire LLM, sans les champs annexes (qty, weight…).
      const highlight = (p: Pos | null) =>
        p
          ? {
              ticker: p.ticker,
              name: p.name,
              price: p.price,
              pru: p.pru,
              var_day_pct: p.varDayPct,
              gain_eur: p.gainEur,
              gain_pct: p.gainPct,
              currency: p.currency,
              account: p.account,
            }
          : null;

      return JSON.stringify({
        totals: snap.totals,
        count_filtered: positions.length,
        // ↓ HIGHLIGHTS pré-calculés. Le LLM doit lire CES valeurs et ne
        //   pas en inventer ni en re-calculer.
        highlights: {
          best_today: highlight(bestToday),
          worst_today: highlight(worstToday),
          best_total: highlight(bestTotal),
          worst_total: highlight(worstTotal),
        },
        positions: positions.map((p) => ({
          ticker: p.ticker,
          name: p.name,
          sector: p.sector,
          qty: p.quantity,
          pru: p.pru,
          price: p.price,
          var_day_pct: p.varDayPct,
          currency: p.currency,
          total_achat: p.totalAchat,
          total_actuel: p.totalActuel,
          gain_eur: p.gainEur,
          gain_pct: p.gainPct,
          account: p.account,
          weight_pct: p.weightPct,
          div_yield_pct: p.divYieldPct,
          div_annual: p.divAnnual,
        })),
        fetched_at: snap.fetchedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      return JSON.stringify({ error: `Portfolio : ${message}` });
    }
  }

  return JSON.stringify({ error: `Outil inconnu : ${name}` });
}

/**
 * Convertit nos ChatMessage en format OpenAI-compatible (Mistral).
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
          { type: "image_url", image_url: m.image },
        ],
      };
    }
    return m;
  });
}

export async function streamLLMChat(
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

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Mistral API ${res.status}: ${errText || "réponse vide"}`);
  }

  return res.body;
}
