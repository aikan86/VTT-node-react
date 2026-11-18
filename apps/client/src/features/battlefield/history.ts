import { ELEMENT_LABELS, OBJECT_LABELS, type Scene } from "@vtt/shared";

/**
 * Cronologia annulla/ripeti delle modifiche del master alla mappa: logica pura, senza store né componenti.
 *
 * Un passo registra solo ciò che è cambiato (elementi aggiunti, modificati o tolti per id, impostazioni della scena),
 * e annullarlo rimette solo quei campi: le modifiche fatte nel frattempo ad altro (nebbia esplorata, porte aperte in
 * gioco, token spostati dai giocatori) restano.
 */

export const HISTORY_LIMIT = 100;
/** Modifiche consecutive agli stessi elementi entro questo intervallo diventano un solo passo (cursori, campi numerici). */
export const MERGE_WINDOW_MS = 800;

const COLLECTIONS = ["elements", "sightBlockers", "objects", "lights", "tokens", "effects", "drawings"] as const;
const SETTINGS = ["background", "grid", "layers", "vision", "dark", "playersMoveParty", "pcStart"] as const;
// Non si annullano: id, name, explored (nebbia esplorata), shownToPlayers (messa in onda).

export type CollectionKey = (typeof COLLECTIONS)[number];
export type SettingKey = (typeof SETTINGS)[number];
type Item = { id: string } & Record<string, unknown>;

export type Change =
  | { kind: "item"; key: CollectionKey; id: string; index: number; before: Item | null; after: Item | null }
  | { kind: "setting"; key: SettingKey; before: unknown; after: unknown };

export interface Step {
  sceneId: string;
  label: string;
  changes: Change[];
  /** Momento dell'ultima modifica confluita nel passo (ms). */
  at: number;
  /** Passi con la stessa chiave entro `MERGE_WINDOW_MS` si fondono; null = mai (aggiunte, eliminazioni). */
  mergeKey: string | null;
}

export interface History {
  sceneId: string | null;
  undo: Step[];
  redo: Step[];
}

export const emptyHistory = (sceneId: string | null = null): History => ({ sceneId, undo: [], redo: [] });

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Cosa è cambiato tra due versioni della scena, solo nelle parti che si annullano. */
export function diffScenes(before: Scene, after: Scene): Change[] {
  const changes: Change[] = [];
  for (const key of COLLECTIONS) {
    const prev = before[key] as unknown as Item[];
    const next = after[key] as unknown as Item[];
    if (prev === next) continue;
    const nextById = new Map(next.map((x, i) => [x.id, { item: x, index: i }]));
    const prevIds = new Set(prev.map((x) => x.id));
    prev.forEach((item, index) => {
      const found = nextById.get(item.id);
      if (!found) changes.push({ kind: "item", key, id: item.id, index, before: item, after: null });
      else if (!same(item, found.item)) changes.push({ kind: "item", key, id: item.id, index: found.index, before: item, after: found.item });
    });
    next.forEach((item, index) => {
      if (!prevIds.has(item.id)) changes.push({ kind: "item", key, id: item.id, index, before: null, after: item });
    });
  }
  for (const key of SETTINGS) {
    if (!same(before[key], after[key])) changes.push({ kind: "setting", key, before: before[key], after: after[key] });
  }
  return changes;
}

/** Riporta `current` da `from` a `to`, toccando solo i campi che differiscono tra i due. */
function revert(current: unknown, from: unknown, to: unknown): unknown {
  if (!isPlainObject(current) || !isPlainObject(from) || !isPlainObject(to)) return to;
  let out: Record<string, unknown> | null = null;
  for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (same(from[k], to[k]) || same(current[k], to[k])) continue;
    out ??= { ...current };
    if (to[k] === undefined) delete out[k];
    else out[k] = to[k];
  }
  return out ?? current;
}

/** Applica un passo all'indietro (annulla) o in avanti (ripeti) sulla versione attuale della scena. */
export function applyStep(scene: Scene, step: Pick<Step, "changes">, direction: "undo" | "redo"): Scene {
  let out: Scene = scene;
  const set = <K extends keyof Scene>(key: K, value: Scene[K]) => {
    if (out[key] !== value) out = { ...out, [key]: value };
  };
  const changes = direction === "undo" ? [...step.changes].reverse() : step.changes;
  for (const change of changes) {
    const from = direction === "undo" ? change.after : change.before;
    const to = direction === "undo" ? change.before : change.after;
    if (change.kind === "setting") {
      const next = revert(out[change.key], from, to);
      if (next === undefined) {
        if (change.key in out) {
          const { [change.key]: _removed, ...rest } = out;
          out = rest as Scene;
        }
      } else set(change.key, next as never);
      continue;
    }
    const list = out[change.key] as unknown as Item[];
    const at = list.findIndex((x) => x.id === change.id);
    if (to === null) {
      if (at >= 0) set(change.key, list.filter((_, i) => i !== at) as never);
    } else if (from === null || at < 0) {
      // ricompare (annullata un'eliminazione / ripetuta un'aggiunta); se intanto è stato tolto un elemento modificato, non si ricrea
      if (at < 0 && from === null) {
        const copy = [...list];
        copy.splice(Math.min(change.index, copy.length), 0, to as Item);
        set(change.key, copy as never);
      }
    } else {
      const next = revert(list[at], from, to) as Item;
      if (next !== list[at]) set(change.key, list.map((x, i) => (i === at ? next : x)) as never);
    }
  }
  return out;
}

const NOUNS: Record<Exclude<CollectionKey, "elements" | "objects" | "drawings">, string> = {
  sightBlockers: "ostacolo alla vista",
  lights: "luce",
  tokens: "token",
  effects: "effetto",
};
const SETTING_NOUNS: Record<SettingKey, string> = {
  background: "sfondo",
  grid: "griglia",
  layers: "livelli",
  vision: "visione",
  dark: "buio",
  playersMoveParty: "movimento dei giocatori",
  pcStart: "punto di partenza dei PG",
};

function noun(change: Extract<Change, { kind: "item" }>): string {
  const item = (change.after ?? change.before)!;
  if (change.key === "elements") return (ELEMENT_LABELS[item.type as keyof typeof ELEMENT_LABELS] ?? "elemento").toLocaleLowerCase("it");
  if (change.key === "objects") return (OBJECT_LABELS[item.kind as keyof typeof OBJECT_LABELS] ?? "oggetto").toLocaleLowerCase("it");
  if (change.key === "drawings") return item.kind === "text" ? "testo" : "disegno";
  return NOUNS[change.key];
}

/** Verbo di una modifica: spostare, ridimensionare, ruotare o, in generale, modificare. */
function verb(before: unknown, after: unknown): string {
  if (!isPlainObject(before) || !isPlainObject(after)) return "modifica";
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !same(before[k], after[k]));
  const only = (allowed: string[]) => fields.length > 0 && fields.every((f) => allowed.includes(f));
  if (only(["x", "y", "points"])) return "sposta";
  if (only(["rotation"])) return "ruota";
  if (only(["x", "y", "w", "h", "widthPx", "heightPx"])) return "ridimensiona";
  return "modifica";
}

export function describeChange(change: Change): string {
  if (change.kind === "item") {
    if (change.before === null) return `aggiungi ${noun(change)}`;
    if (change.after === null) return `elimina ${noun(change)}`;
    return `${verb(change.before, change.after)} ${noun(change)}`;
  }
  const what = SETTING_NOUNS[change.key];
  if (change.before == null) return `imposta ${what}`;
  if (change.after == null) return `rimuovi ${what}`;
  return `${verb(change.before, change.after)} ${what}`;
}

export function describeChanges(changes: Change[]): string {
  const labels = changes.map(describeChange);
  if (labels.length === 1) return labels[0]!;
  if (labels.every((l) => l === labels[0])) return `${labels[0]} (×${labels.length})`;
  return `${labels.length} modifiche`;
}

/** Chiave per fondere modifiche consecutive: solo modifiche (niente aggiunte o eliminazioni), sugli stessi elementi. */
function mergeKeyOf(changes: Change[]): string | null {
  if (changes.some((c) => c.kind === "item" && (c.before === null || c.after === null))) return null;
  return changes
    .map((c) => (c.kind === "item" ? `${c.key}:${c.id}` : c.key))
    .sort()
    .join("|");
}

/** Unisce `next` al passo `step`: si tiene lo stato prima del primo e quello dopo l'ultimo. */
function mergeChanges(first: Change[], next: Change[]): Change[] {
  const out = [...first];
  for (const change of next) {
    const i = out.findIndex((c) => c.kind === change.kind && c.key === change.key && (c.kind === "setting" || (change.kind === "item" && c.id === change.id)));
    if (i < 0) out.push(change);
    else out[i] = { ...out[i]!, after: change.after } as Change;
  }
  return out.filter((c) => !same(c.before, c.after));
}

export interface RecordOptions {
  now: number;
  /** Descrizione al posto di quella calcolata (es. "calibra sfondo"). */
  label?: string;
  /** Mai fondere con il passo precedente. */
  separate?: boolean;
  limit?: number;
  mergeMs?: number;
}

/** Registra una modifica alla scena `sceneId`. Una scena diversa da quella della cronologia la azzera. */
export function record(history: History, sceneId: string, changes: Change[], opts: RecordOptions): History {
  const h = history.sceneId === sceneId ? history : emptyHistory(sceneId);
  if (changes.length === 0) return h;
  const limit = opts.limit ?? HISTORY_LIMIT;
  const mergeKey = opts.separate || opts.label ? null : mergeKeyOf(changes);
  const last = h.undo[h.undo.length - 1];
  // dopo un annulla (redo non vuoto) si riparte con un passo nuovo
  if (last && h.redo.length === 0 && mergeKey !== null && last.mergeKey === mergeKey && opts.now - last.at <= (opts.mergeMs ?? MERGE_WINDOW_MS)) {
    const merged = mergeChanges(last.changes, changes);
    const undo = h.undo.slice(0, -1);
    if (merged.length > 0) undo.push({ ...last, changes: merged, label: describeChanges(merged), at: opts.now });
    return { ...h, undo, redo: [] };
  }
  const step: Step = { sceneId, label: opts.label ?? describeChanges(changes), changes, at: opts.now, mergeKey };
  return { ...h, undo: [...h.undo, step].slice(-limit), redo: [] };
}

/** Toglie l'ultimo passo da annullare e lo mette tra quelli da ripetere. */
export function takeUndo(history: History): { history: History; step: Step } | null {
  const step = history.undo[history.undo.length - 1];
  if (!step) return null;
  return { history: { ...history, undo: history.undo.slice(0, -1), redo: [...history.redo, step] }, step };
}

/** Toglie l'ultimo passo da ripetere e lo rimette tra quelli da annullare. */
export function takeRedo(history: History): { history: History; step: Step } | null {
  const step = history.redo[history.redo.length - 1];
  if (!step) return null;
  // ripetuto, non si fonde più con le modifiche che seguono
  return { history: { ...history, redo: history.redo.slice(0, -1), undo: [...history.undo, { ...step, mergeKey: null }] }, step };
}

/** Per un'altra scena la cronologia riparte vuota. */
export const forScene = (history: History, sceneId: string | null): History => (history.sceneId === sceneId ? history : emptyHistory(sceneId));
