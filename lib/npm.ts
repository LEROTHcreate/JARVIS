/**
 * Métadonnées d'un package npm via le registry public.
 *
 * Endpoints :
 *   - registry.npmjs.org/{package} → manifeste complet (versions, deps, license, repo)
 *   - api.npmjs.org/downloads/point/last-week/{package} → téléchargements
 *
 * Gratuit, sans clé. Cache 10 min côté serveur.
 */

const UA = "JARVIS/1.0 (npm client)";

export interface NpmPackage {
  name: string;
  description: string | null;
  latestVersion: string;
  license: string | null;
  author: string | null;
  homepage: string | null;
  repository: string | null;
  npmUrl: string;
  /** Date de publication de la dernière version (ISO). */
  lastPublished: string | null;
  /** Téléchargements semaine dernière (npm download stats). */
  weeklyDownloads: number | null;
  dependencies: string[];
  peerDependencies: string[];
  keywords: string[];
  /** Nombre total de versions publiées. */
  versionCount: number;
}

export async function fetchNpmPackage(name: string): Promise<NpmPackage | null> {
  const safe = name.trim();
  if (!safe) return null;
  // Note : encodeURIComponent pour gérer les scopes @scope/pkg → encode le `/`.
  // mais le registry npm accepte le `/` direct, et l'encoder casserait l'URL.
  // Solution : encode seulement le `@` du scope si nécessaire.
  const encoded = safe.replace(/^@/, "@");
  const res = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`npm registry ${res.status}`);
  const data = await res.json();
  const latest = data?.["dist-tags"]?.latest ?? "";
  const latestManifest = data?.versions?.[latest] ?? {};
  const timeMap = data?.time ?? {};
  const lastPublished = latest ? (timeMap[latest] as string) ?? null : null;

  // Téléchargements (best-effort, on n'erreur pas si ça échoue)
  let weeklyDownloads: number | null = null;
  try {
    const dlRes = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encoded}`,
      {
        headers: { "User-Agent": UA },
        next: { revalidate: 3600 },
      },
    );
    if (dlRes.ok) {
      const dl = await dlRes.json();
      if (typeof dl?.downloads === "number") weeklyDownloads = dl.downloads;
    }
  } catch {
    // ignore
  }

  return {
    name: data.name ?? safe,
    description: data.description ?? latestManifest.description ?? null,
    latestVersion: latest,
    license: data.license ?? latestManifest.license ?? null,
    author:
      typeof data.author === "string"
        ? data.author
        : data.author?.name ?? null,
    homepage: data.homepage ?? latestManifest.homepage ?? null,
    repository:
      typeof data.repository === "string"
        ? data.repository
        : data.repository?.url ?? null,
    npmUrl: `https://www.npmjs.com/package/${data.name ?? safe}`,
    lastPublished,
    weeklyDownloads,
    dependencies: Object.keys(latestManifest.dependencies ?? {}),
    peerDependencies: Object.keys(latestManifest.peerDependencies ?? {}),
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
    versionCount: Object.keys(data.versions ?? {}).length,
  };
}
