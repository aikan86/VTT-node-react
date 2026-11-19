import type { NpcTemplate } from "./initiative";
import { MonsterStatsSchema, type Handout, type MonsterStats, type NpcGroup } from "./schemas/library";

/** Nome inglese dei mostri preimpostati nell'archivio online delle illustrazioni (stessi mostri, archivio della 5e). */
const PRESET_SRD: Record<string, string> = {
  Coboldo: "kobold",
  Goblin: "goblin",
  "Ratto crudele": "giant-rat",
  Scheletro: "skeleton",
  Orco: "orc",
  Hobgoblin: "hobgoblin",
  Zombi: "zombie",
  Gnoll: "gnoll",
  Ghoul: "ghoul",
  Lupo: "wolf",
  Lucertoloide: "lizardfolk",
  Bugbear: "bugbear",
  "Ragno mostruoso grande": "giant-spider",
  Worg: "worg",
  "Lupo crudele": "dire-wolf",
  Ogre: "ogre",
  Wight: "wight",
  "Cubo gelatinoso": "gelatinous-cube",
  "Orso bruno": "brown-bear",
  "Gufo-orso": "owlbear",
  Mimic: "mimic",
  Manticora: "manticore",
  Troll: "troll",
};

/** Da dove vengono le illustrazioni cercate online (da citare dove si mostrano). */
export const SRD_IMAGE_CREDIT = "dnd5eapi.co (SRD 5e)";

/**
 * Mostri preimpostati di D&D 3.5e, con PF medi, CA, iniziativa, taglia (1 = Piccola/Media, 2 = Grande) e GS
 * presi dall'SRD 3.5 (d20srd.org). Per i PNG con classe (coboldo, goblin, orco, hobgoblin) è la versione "guerriero di 1° livello".
 */
export const PRESET_MONSTERS: readonly MonsterStats[] = ([
  { name: "Coboldo", hp: 4, ac: 15, initiativeMod: 1, size: 1, color: "#b45309", cr: "1/4" },
  { name: "Goblin", hp: 5, ac: 15, initiativeMod: 1, size: 1, color: "#dc2626", cr: "1/3" },
  { name: "Ratto crudele", hp: 5, ac: 15, initiativeMod: 3, size: 1, color: "#78716c", cr: "1/3" },
  { name: "Scheletro", hp: 6, ac: 15, initiativeMod: 5, size: 1, color: "#d6d3d1", cr: "1/3" },
  { name: "Orco", hp: 5, ac: 13, initiativeMod: 0, size: 1, color: "#15803d", cr: "1/2" },
  { name: "Hobgoblin", hp: 6, ac: 15, initiativeMod: 1, size: 1, color: "#ea580c", cr: "1/2" },
  { name: "Zombi", hp: 16, ac: 11, initiativeMod: -1, size: 1, color: "#4d7c0f", cr: "1/2" },
  { name: "Gnoll", hp: 11, ac: 15, initiativeMod: 0, size: 1, color: "#a16207", cr: "1" },
  { name: "Ghoul", hp: 13, ac: 14, initiativeMod: 2, size: 1, color: "#57534e", cr: "1" },
  { name: "Lupo", hp: 13, ac: 14, initiativeMod: 2, size: 1, color: "#6b7280", cr: "1" },
  { name: "Lucertoloide", hp: 11, ac: 15, initiativeMod: 0, size: 1, color: "#3f6212", cr: "1" },
  { name: "Bugbear", hp: 16, ac: 17, initiativeMod: 1, size: 1, color: "#92400e", cr: "2" },
  { name: "Ragno mostruoso grande", hp: 22, ac: 14, initiativeMod: 3, size: 2, color: "#1f2937", cr: "2" },
  { name: "Worg", hp: 30, ac: 14, initiativeMod: 2, size: 1, color: "#44403c", cr: "2" },
  { name: "Lupo crudele", hp: 45, ac: 14, initiativeMod: 2, size: 2, color: "#374151", cr: "3" },
  { name: "Ogre", hp: 29, ac: 16, initiativeMod: -1, size: 2, color: "#a855f7", cr: "3" },
  { name: "Wight", hp: 26, ac: 15, initiativeMod: 1, size: 1, color: "#1e3a8a", cr: "3" },
  { name: "Cubo gelatinoso", hp: 54, ac: 4, initiativeMod: -5, size: 2, color: "#22d3ee", cr: "3" },
  { name: "Orso bruno", hp: 51, ac: 15, initiativeMod: 1, size: 2, color: "#78350f", cr: "4" },
  { name: "Gufo-orso", hp: 52, ac: 15, initiativeMod: 1, size: 2, color: "#a3a3a3", cr: "4" },
  { name: "Mimic", hp: 52, ac: 15, initiativeMod: 1, size: 2, color: "#854d0e", cr: "4" },
  { name: "Manticora", hp: 57, ac: 17, initiativeMod: 2, size: 2, color: "#b91c1c", cr: "5" },
  { name: "Troll", hp: 63, ac: 16, initiativeMod: 2, size: 2, color: "#166534", cr: "5" },
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
