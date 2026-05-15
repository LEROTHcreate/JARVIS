import DOMPurify, { type Config } from "isomorphic-dompurify";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";

// Enregistrement langues : on choisit celles qu'un user JARVIS demande le
// plus souvent. Pas de gros bundle (highlight.js core seul ~15 KB + 1-2 KB
// par langue).
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("go", go);

// Renderer marked custom : code blocks → highlight.js
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : "";
      let highlighted: string;
      try {
        highlighted = language
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = text; // fallback : code brut si hljs throws
      }
      const langClass = language || "plaintext";
      return `<pre class="hljs"><code class="hljs language-${langClass}">${highlighted}</code></pre>`;
    },
  },
});

// Configuration DOMPurify : whitelist stricte. Aucun script, aucun style
// inline, aucun handler (onclick…). On ne garde que le markdown rendu.
const PURIFY_OPTIONS: Config = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    // `mark` : utilisé par JARVIS pour souligner les passages cités tels
    // quels d'une source (wikipedia_summary, news_headlines, web_search).
    // Stylé en cyan (rouge en mode Ultron via hue-rotate) dans globals.css.
    "mark",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
  // Force tous les <a> en _blank avec rel="noopener noreferrer" via
  // ALLOW_DATA_ATTR=false pour éviter d'éventuels data-*. On ne fait pas
  // confiance aux href fantaisistes (javascript:, data:…) — DOMPurify les
  // strippe par défaut.
  ALLOW_DATA_ATTR: false,
};

/**
 * Nettoie le contenu LLM avant rendu HTML :
 *  1. Retire les blocs `[[MAP]]…[[/MAP]]` et appels d'outils "leakés" en texte
 *     (les LLMs hors tool-use natif les laissent parfois passer).
 *  2. Convertit le markdown en HTML via `marked` (parser propre, plus de regex
 *     maison).
 *  3. Passe le résultat dans DOMPurify avec une whitelist stricte → impossible
 *     d'injecter `<script>`, `<img onerror>`, `javascript:`…
 *
 * Renvoie une string HTML qu'on peut donner à `dangerouslySetInnerHTML` en
 * toute sécurité.
 */
export function renderSafeMarkdown(raw: string): string {
  const cleaned = raw
    .replace(/\[\[MAP\]\][\s\S]*?\[\[\/MAP\]\]/g, "")
    .replace(
      /[?]?\/?\/?\{\{?\s*(find_nearby|web_search)\s*\{[^}]*\}\}?\}?/g,
      "",
    )
    .replace(/^\s*[?/]+\s*$/gm, "")
    .trim();

  const rawHtml = marked.parse(cleaned, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, PURIFY_OPTIONS);
}
