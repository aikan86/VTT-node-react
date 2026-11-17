import type { NpcTemplate } from "./initiative";
import { MonsterStatsSchema, type Handout, type MonsterStats, type NpcGroup } from "./schemas/library";

/** Nome inglese nell'SRD 5e online dei mostri preimpostati (per l'illustrazione). */
const PRESET_SRD: Record<string, string> = {
  Coboldo: "kobold",
  Bandito: "bandit",
  Cultista: "cultist",
  Guardia: "guard",
  Goblin: "goblin",
  Scheletro: "skeleton",
  Zombi: "zombie",
  Lupo: "wolf",
  Hobgoblin: "hobgoblin",
  Orco: "orc",
  Gnoll: "gnoll",
  Ghoul: "ghoul",
  Bugbear: "bugbear",
  "Ragno gigante": "giant-spider",
  "Lupo crudele": "dire-wolf",
  "Orso bruno": "brown-bear",
  "Capo dei banditi": "bandit-captain",
  Ogre: "ogre",
  Mimic: "mimic",
  "Cubo gelatinoso": "gelatinous-cube",
  "Gufo-orso": "owlbear",
  Troll: "troll",
  "Giovane drago rosso": "young-red-dragon",
};

/** Da dove vengono le illustrazioni cercate online (da citare dove si mostrano). */
export const SRD_IMAGE_CREDIT = "dnd5eapi.co (SRD 5e)";

/** Mostri preimpostati (statistiche base del SRD 5e, nomi in italiano). */
export const PRESET_MONSTERS: readonly MonsterStats[] = ([
  { name: "Coboldo", hp: 5, ac: 12, initiativeMod: 2, size: 1, color: "#b45309", cr: "1/8" },
  { name: "Bandito", hp: 11, ac: 12, initiativeMod: 1, size: 1, color: "#78716c", cr: "1/8" },
  { name: "Cultista", hp: 9, ac: 12, initiativeMod: 1, size: 1, color: "#7f1d1d", cr: "1/8" },
  { name: "Guardia", hp: 11, ac: 16, initiativeMod: 1, size: 1, color: "#1d4ed8", cr: "1/8" },
  { name: "Goblin", hp: 7, ac: 15, initiativeMod: 2, size: 1, color: "#dc2626", cr: "1/4" },
  { name: "Scheletro", hp: 13, ac: 13, initiativeMod: 2, size: 1, color: "#d6d3d1", cr: "1/4" },
  { name: "Zombi", hp: 22, ac: 8, initiativeMod: -2, size: 1, color: "#4d7c0f", cr: "1/4" },
  { name: "Lupo", hp: 11, ac: 13, initiativeMod: 2, size: 1, color: "#6b7280", cr: "1/4" },
  { name: "Hobgoblin", hp: 11, ac: 18, initiativeMod: 1, size: 1, color: "#ea580c", cr: "1/2" },
  { name: "Orco", hp: 15, ac: 13, initiativeMod: 1, size: 1, color: "#15803d", cr: "1/2" },
  { name: "Gnoll", hp: 22, ac: 15, initiativeMod: 1, size: 1, color: "#a16207", cr: "1/2" },
  { name: "Ghoul", hp: 22, ac: 12, initiativeMod: 2, size: 1, color: "#57534e", cr: "1" },
  { name: "Bugbear", hp: 27, ac: 16, initiativeMod: 2, size: 1, color: "#92400e", cr: "1" },
  { name: "Ragno gigante", hp: 26, ac: 14, initiativeMod: 3, size: 2, color: "#1f2937", cr: "1" },
  { name: "Lupo crudele", hp: 37, ac: 14, initiativeMod: 2, size: 2, color: "#374151", cr: "1" },
  { name: "Orso bruno", hp: 34, ac: 11, initiativeMod: 0, size: 2, color: "#78350f", cr: "1" },
  { name: "Capo dei banditi", hp: 65, ac: 15, initiativeMod: 2, size: 1, color: "#44403c", cr: "2" },
  { name: "Ogre", hp: 59, ac: 11, initiativeMod: -1, size: 2, color: "#a855f7", cr: "2" },
  { name: "Mimic", hp: 58, ac: 12, initiativeMod: 1, size: 1, color: "#854d0e", cr: "2" },
  { name: "Cubo gelatinoso", hp: 84, ac: 6, initiativeMod: -4, size: 2, color: "#22d3ee", cr: "2" },
  { name: "Gufo-orso", hp: 59, ac: 13, initiativeMod: 1, size: 2, color: "#a3a3a3", cr: "3" },
  { name: "Troll", hp: 84, ac: 15, initiativeMod: 1, size: 2, color: "#166534", cr: "5" },
  { name: "Giovane drago rosso", hp: 178, ac: 18, initiativeMod: 0, size: 2, color: "#b91c1c", cr: "10" },
] as MonsterStats[]).map((m) => ({ ...m, srd: PRESET_SRD[m.name] }));

/** Modello da cui il tracker crea i PNG. */
export function monsterTemplate(m: MonsterStats): NpcTemplate {
  return {
    name: m.name,
    color: m.color,
    hp: { current: m.hp, max: m.hp, temp: 0 },
    ac: m.ac,
    initiativeMod: m.initiativeMod,
    size: m.size,
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
  };
}

/** Statistiche dai campi di un PNG già impostato (dal dialogo). */
export function statsFromTemplate(t: NpcTemplate): MonsterStats {
  return { name: t.name, hp: t.hp.max, ac: t.ac, initiativeMod: t.initiativeMod, size: t.size, color: t.color, ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}) };
}

/** "Giant Spider" → "giant-spider" (senza accenti né simboli); null se non resta nulla. */
export function srdSlug(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || null;
}

/**
 * Nome con cui cercare l'illustrazione di un mostro nell'SRD online: quello indicato, o quello inglese dei preimpostati
 * (anche per i PNG numerati: "Goblin 3" → "goblin"), altrimenti il nome stesso ("Owlbear" → "owlbear").
 */
export function srdIndexFor(monster: { name: string; srd?: string }): string | null {
  if (monster.srd) return monster.srd;
  const base = monster.name.replace(/\s+\d+$/, "").trim();
  const preset = PRESET_MONSTERS.find((m) => m.name.toLowerCase() === base.toLowerCase());
  return preset?.srd ?? srdSlug(base);
}

const DEFAULT_COLOR = "#dc2626";
const SIZE_BY_NAME: Record<string, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
  minuscola: 1, piccola: 1, media: 1, grande: 2, enorme: 3, mastodontica: 4,
};

type Raw = Record<string, unknown>;
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const first = (raw: Raw, keys: string[]) => keys.map((k) => raw[k]).find((v) => v !== undefined && v !== null);

/** CA scritta in vari modi: 15, "15 (armatura di cuoio)", [{ value: 15 }] (formato 5e-database). */
function armorClass(v: unknown): number | undefined {
  if (Array.isArray(v)) return armorClass(v[0]);
  if (v && typeof v === "object") return num((v as Raw).value);
  if (typeof v === "string") return num(v.match(/-?\d+/)?.[0]);
  return num(v);
}

/** PF scritti come 7 o "7 (2d6)". */
function hitPoints(v: unknown): number | undefined {
  return typeof v === "string" ? num(v.match(/\d+/)?.[0]) : num(v);
}

/**
 * Un mostro da un oggetto JSON: accetta il formato dell'app (`name, hp, ac, initiativeMod, size, color, cr`)
 * e i nomi più comuni dei file 5e (`hit_points`, `armor_class`, `dexterity`, `size: "Large"`, `challenge_rating`, nomi in italiano).
 * Restituisce null se mancano nome, PF o CA o i valori non sono validi.
 */
export function normalizeMonster(input: unknown): MonsterStats | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Raw;
  const name = first(raw, ["name", "nome"]);
  const hp = hitPoints(first(raw, ["hp", "pf", "hitPoints", "hit_points"]));
  const ac = armorClass(first(raw, ["ac", "ca", "armorClass", "armor_class"]));
  let initiativeMod = num(first(raw, ["initiativeMod", "initiative", "iniziativa", "init"]));
  if (initiativeMod === undefined) {
    const dex = num(first(raw, ["dexterity", "dex", "destrezza", "des"]));
    initiativeMod = dex === undefined ? 0 : Math.floor((dex - 10) / 2);
  }
  const sizeRaw = first(raw, ["size", "taglia"]);
  const size = typeof sizeRaw === "string" ? (SIZE_BY_NAME[sizeRaw.trim().toLowerCase()] ?? num(sizeRaw)) : num(sizeRaw);
  const crRaw = first(raw, ["cr", "challenge_rating", "challengeRating", "gs"]);
  const cr = typeof crRaw === "number" ? formatCr(crRaw) : typeof crRaw === "string" ? crRaw : undefined;
  const color = first(raw, ["color", "colore"]);
  // identificativo SRD (i file 5e-database lo chiamano "index"): serve a cercare l'illustrazione online
  const srdRaw = first(raw, ["srd", "index"]);
  const srd = typeof srdRaw === "string" ? srdSlug(srdRaw) : null;
  const parsed = MonsterStatsSchema.safeParse({
    ...(srd ? { srd } : {}),
    name: typeof name === "string" ? name : undefined,
    hp: hp === undefined ? undefined : Math.round(hp),
    ac: ac === undefined ? undefined : Math.round(ac),
    initiativeMod: Math.round(initiativeMod),
    size: size === undefined ? 1 : Math.round(size),
    color: typeof color === "string" ? color : DEFAULT_COLOR,
    ...(cr ? { cr } : {}),
  });
  return parsed.success ? parsed.data : null;
}

/** 0.25 → "1/4" */
function formatCr(cr: number): string {
  const fractions: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return fractions[cr] ?? String(cr);
}

export interface MonsterImport {
  monsters: MonsterStats[];
  /** Voci scartate perché incomplete o non valide. */
  skipped: number;
}

/** Legge un file di bestiario: un array di mostri, oppure un oggetto con `monsters`/`mostri`/`results`, oppure un mostro solo. */
export function parseMonsterFile(text: string): MonsterImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Il file non è un JSON valido");
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((["monsters", "mostri", "results"].map((k) => (data as Raw)[k]).find(Array.isArray) as unknown[] | undefined) ?? [data])
      : [];
  const monsters = list.map(normalizeMonster).filter((m): m is MonsterStats => m !== null);
  if (monsters.length === 0) throw new Error("Nessun mostro valido nel file: servono almeno nome, PF e CA");
  return { monsters, skipped: list.length - monsters.length };
}

/** Riepilogo di un gruppo: "4 Goblin, 1 Hobgoblin". */
export const groupSummary = (group: Pick<NpcGroup, "members">) => group.members.map((m) => `${m.quantity} ${m.monster.name}`).join(", ");

/** Handout mostrato ora ai giocatori (il più recente fra quelli mostrati), se c'è. */
export function currentHandout(handouts: readonly Handout[]): Handout | undefined {
  let best: Handout | undefined;
  for (const h of handouts) if (h.shownAt && (!best || h.shownAt > best.shownAt!)) best = h;
  return best;
}
