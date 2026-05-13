import type { ChatMessage } from "@/types";

/**
 * Définition d'une commande JARVIS exécutable depuis :
 *  - le slash menu (taper `/` dans l'input)
 *  - la command palette (Ctrl+K / Cmd+K)
 */
export interface JarvisCommand {
  id: string; // identifiant court, sert aussi de slash hint (ex: "clear" → /clear)
  label: string; // nom humain affiché ("Effacer la conversation")
  description?: string; // explication courte
  category?: "session" | "view" | "data" | "system";
  shortcut?: string; // raccourci clavier optionnel ("⌘K", "Esc")
  action: () => void | Promise<void>;
}

/**
 * Filtre fuzzy : matche par id, label, description.
 * Si la query commence par "/", on retire le slash avant de chercher.
 */
export function filterCommands(
  commands: JarvisCommand[],
  query: string,
): JarvisCommand[] {
  const q = query.toLowerCase().trim().replace(/^\//, "");
  if (!q) return commands;
  return commands.filter((c) => {
    const hay = `${c.id} ${c.label} ${c.description ?? ""}`.toLowerCase();
    // Match si chaque caractère de q apparaît dans hay dans l'ordre (fuzzy léger)
    let i = 0;
    for (const ch of hay) {
      if (ch === q[i]) i++;
      if (i === q.length) return true;
    }
    return q.length === 0;
  });
}

/**
 * Détecte si l'input courant ressemble à une slash command : commence par
 * `/` et ne contient pas d'espace après le mot (sinon c'est juste du texte).
 */
export function isSlashQuery(input: string): boolean {
  if (!input.startsWith("/")) return false;
  // "/clear" ou "/cle" → oui ; "/clear something" → non (l'utilisateur a continué)
  return !/\s/.test(input.trim());
}

/**
 * Exporte la conversation en markdown et déclenche le téléchargement.
 */
export function exportConversationMarkdown(messages: ChatMessage[]): void {
  const date = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-");
  const md = [
    `# Conversation JARVIS — ${new Date().toLocaleString("fr-FR")}`,
    "",
    ...messages.map((m) => {
      const who = m.role === "user" ? "🧑 Moi" : "🤖 JARVIS";
      return `## ${who}\n\n${m.content}\n`;
    }),
  ].join("\n");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jarvis-conversation-${date}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
