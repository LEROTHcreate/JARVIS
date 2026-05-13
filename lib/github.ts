/**
 * Métadonnées d'un repo GitHub via l'API REST publique.
 *
 * - Sans token : 60 req/h par IP. Largement suffisant pour usage perso.
 * - Si la variable d'env `GITHUB_TOKEN` est définie : 5000 req/h.
 *
 * Endpoint principal : `https://api.github.com/repos/{owner}/{repo}`
 * Donne stars, forks, langage principal, description, dernier push, license, etc.
 */

const UA = "JARVIS/1.0 (github client)";
const BASE_URL = "https://api.github.com";

export interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  defaultBranch: string;
  topics: string[];
  license: string | null;
  /** Date de création + dernier push (ISO). */
  createdAt: string;
  pushedAt: string;
  /** Si archive ou template. */
  archived: boolean;
  isTemplate: boolean;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

/**
 * Accepte plusieurs formats d'input :
 *   - "owner/repo"
 *   - "owner repo"
 *   - URL complète "https://github.com/owner/repo"
 */
function parseRepoSpec(spec: string): { owner: string; repo: string } | null {
  const s = spec.trim();
  const urlMatch = s.match(
    /(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s?#]+)/i,
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2].replace(/\.git$/, ""),
    };
  }
  const slashMatch = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }
  const spaceMatch = s.split(/\s+/).filter(Boolean);
  if (spaceMatch.length === 2) {
    return { owner: spaceMatch[0], repo: spaceMatch[1] };
  }
  return null;
}

export async function fetchGitHubRepo(
  spec: string,
): Promise<GitHubRepo | null> {
  const parsed = parseRepoSpec(spec);
  if (!parsed) {
    throw new Error(
      `Format invalide : '${spec}'. Attendu : 'owner/repo' ou URL GitHub.`,
    );
  }
  const url = `${BASE_URL}/repos/${encodeURIComponent(
    parsed.owner,
  )}/${encodeURIComponent(parsed.repo)}`;
  const res = await fetch(url, {
    headers: headers(),
    next: { revalidate: 600 },
  });
  if (res.status === 404) return null;
  if (res.status === 403) {
    throw new Error(
      "Rate limit GitHub atteint (60 req/h sans token). Définir GITHUB_TOKEN dans .env pour 5000 req/h.",
    );
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  return {
    owner: data.owner?.login ?? parsed.owner,
    name: data.name ?? parsed.repo,
    fullName: data.full_name ?? `${parsed.owner}/${parsed.repo}`,
    url: data.html_url ?? `https://github.com/${parsed.owner}/${parsed.repo}`,
    description: data.description ?? null,
    homepage: data.homepage || null,
    language: data.language ?? null,
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    watchers: data.subscribers_count ?? data.watchers_count ?? 0,
    defaultBranch: data.default_branch ?? "main",
    topics: Array.isArray(data.topics) ? data.topics : [],
    license: data.license?.spdx_id ?? data.license?.name ?? null,
    createdAt: data.created_at ?? "",
    pushedAt: data.pushed_at ?? "",
    archived: !!data.archived,
    isTemplate: !!data.is_template,
  };
}
