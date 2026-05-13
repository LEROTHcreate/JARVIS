/**
 * Client API locale Philips Hue.
 *
 * - Discovery via le service meethue (renvoie l'IP de la bridge sur ton LAN).
 * - Pairing : nécessite un appui sur le bouton physique de la bridge avant
 *   l'appel à `pairBridge`, sinon Hue répond avec une erreur 101.
 * - Une fois pairé, on stocke `HUE_BRIDGE_IP` + `HUE_USERNAME` dans .env.local.
 * - Toutes les commandes "tool" (list_lights / control_lights) passent par
 *   les helpers ci-dessous, exécutés côté serveur (pas de CORS, pas de
 *   contrainte HTTPS — on tape directement http://IP/api/USERNAME/…).
 */

export interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number; // 0..100 (% — converti depuis bri 0..254)
  reachable: boolean;
  type?: string;
}

export interface HueGroup {
  id: string;
  name: string;
  lights: string[]; // ids des lampes du groupe
}

interface HueRawLight {
  name: string;
  state: {
    on: boolean;
    bri?: number;
    reachable?: boolean;
  };
  type?: string;
}

interface HueRawGroup {
  name: string;
  lights: string[];
}

function getBridge(): { ip: string; username: string } {
  const ip = process.env.HUE_BRIDGE_IP;
  const username = process.env.HUE_USERNAME;
  if (!ip || !username) {
    throw new Error(
      "HUE_BRIDGE_IP / HUE_USERNAME manquantes. Visite /setup/hue pour pairer ta bridge.",
    );
  }
  return { ip, username };
}

/**
 * Discover les bridges Hue sur le LAN via le service public meethue.
 * Retourne une liste de `{ id, internalipaddress }`. Vide si rien trouvé.
 */
export async function discoverBridges(): Promise<
  { id: string; internalipaddress: string }[]
> {
  const res = await fetch("https://discovery.meethue.com/", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

/**
 * Génère un username sur la bridge. L'utilisateur doit avoir appuyé sur le
 * bouton physique de la bridge dans les 30 dernières secondes, sinon
 * l'API renvoie une erreur 101 ("link button not pressed").
 */
export async function pairBridge(
  ip: string,
  deviceLabel = "jarvis#web",
): Promise<{ username: string }> {
  const res = await fetch(`http://${ip}/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ devicetype: deviceLabel }),
  });
  if (!res.ok) throw new Error(`Bridge HTTP ${res.status}`);
  const data = (await res.json()) as Array<
    | { success: { username: string } }
    | { error: { type: number; description: string } }
  >;
  const entry = data[0];
  if (!entry) throw new Error("Réponse Hue vide");
  if ("error" in entry) {
    throw new Error(entry.error.description);
  }
  return { username: entry.success.username };
}

export async function listLights(): Promise<HueLight[]> {
  const { ip, username } = getBridge();
  const res = await fetch(`http://${ip}/api/${username}/lights`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hue HTTP ${res.status}`);
  const raw = (await res.json()) as Record<string, HueRawLight>;
  return Object.entries(raw).map(([id, l]) => ({
    id,
    name: l.name,
    on: l.state.on,
    brightness: Math.round(((l.state.bri ?? 0) / 254) * 100),
    reachable: l.state.reachable ?? true,
    type: l.type,
  }));
}

export async function listGroups(): Promise<HueGroup[]> {
  const { ip, username } = getBridge();
  const res = await fetch(`http://${ip}/api/${username}/groups`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hue HTTP ${res.status}`);
  const raw = (await res.json()) as Record<string, HueRawGroup>;
  return Object.entries(raw).map(([id, g]) => ({
    id,
    name: g.name,
    lights: g.lights,
  }));
}

export interface HueAction {
  on?: boolean;
  /** 0..254. Utilisé en interne ; pour l'API publique on accepte 0..100 % */
  bri?: number;
  /** Mired color temp : 153 (cool) → 500 (warm). Mappable depuis "warm"/"cool". */
  ct?: number;
}

/**
 * Applique un état (on/off + brightness + couleur) à une ou plusieurs lampes
 * identifiées par leur nom (matching case-insensitive). Pass `"all"` pour
 * piloter le groupe 0 (toutes les lampes).
 */
export async function applyAction(
  target: "all" | string[],
  action: HueAction,
): Promise<{ affected: string[] }> {
  const { ip, username } = getBridge();

  if (target === "all") {
    const res = await fetch(`http://${ip}/api/${username}/groups/0/action`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!res.ok) throw new Error(`Hue HTTP ${res.status}`);
    return { affected: ["all"] };
  }

  // Sinon : matcher les noms aux lampes existantes
  const lights = await listLights();
  const groups = await listGroups();
  const requested = target.map((t) => t.toLowerCase().trim());

  // Résout des noms → ids de lampes. Un nom peut désigner soit une lampe
  // individuelle, soit un groupe (Room/Zone) → on étale le groupe en lampes.
  const matchedIds = new Set<string>();
  const matchedNames: string[] = [];

  for (const r of requested) {
    const light = lights.find((l) => l.name.toLowerCase() === r);
    if (light) {
      matchedIds.add(light.id);
      matchedNames.push(light.name);
      continue;
    }
    const group = groups.find((g) => g.name.toLowerCase() === r);
    if (group) {
      for (const id of group.lights) matchedIds.add(id);
      matchedNames.push(group.name);
      continue;
    }
    // Match partiel : "salon" matche "Lampe salon"
    const partial = lights.find((l) => l.name.toLowerCase().includes(r));
    if (partial) {
      matchedIds.add(partial.id);
      matchedNames.push(partial.name);
      continue;
    }
    const partialGroup = groups.find((g) =>
      g.name.toLowerCase().includes(r),
    );
    if (partialGroup) {
      for (const id of partialGroup.lights) matchedIds.add(id);
      matchedNames.push(partialGroup.name);
    }
  }

  if (matchedIds.size === 0) {
    throw new Error(
      `Aucune lampe trouvée pour : ${target.join(", ")}. Lampes connues : ${lights.map((l) => l.name).join(", ")}`,
    );
  }

  // Applique en parallèle
  await Promise.all(
    Array.from(matchedIds).map((id) =>
      fetch(`http://${ip}/api/${username}/lights/${id}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      }),
    ),
  );

  return { affected: matchedNames };
}

/** Convertit un pourcentage 0..100 → bri Hue 1..254. */
export function brightnessPctToBri(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(1, Math.round((clamped / 100) * 254));
}

/** Convertit "warm"/"cool"/"neutral" → mired (153..500). */
export function colorTempToCt(temp: "warm" | "cool" | "neutral"): number {
  if (temp === "warm") return 470;
  if (temp === "cool") return 200;
  return 350; // neutral
}
