import { rollD20, type Rng } from "./dice";
import { createId, sameRef, type Ref } from "./schemas/common";
import type { Combat, Combatant, Npc } from "./schemas/combat";

/** Restituisce il modificatore di iniziativa dell'entità referenziata. */
export type ModLookup = (ref: Ref) => number;

export type NpcTemplate = Pick<Npc, "name" | "color" | "hp" | "ac" | "initiativeMod" | "size" | "imageUrl">;

export function getTotal(c: Combatant, getMod: ModLookup): number | null {
  return c.roll === null ? null : c.roll + getMod(c.ref);
}

function compare(a: Combatant, b: Combatant, getMod: ModLookup): number {
  const ta = getTotal(a, getMod);
  const tb = getTotal(b, getMod);
  if (ta === null || tb === null) {
    if (ta !== tb) return ta === null ? 1 : -1;
    return a.order - b.order;
  }
  return tb - ta || getMod(b.ref) - getMod(a.ref) || a.order - b.order;
}

/** Ordine di iniziativa: totale ↓, modificatore ↓, ordine manuale ↑; chi non ha tirato in fondo. */
export function sortCombatants(list: readonly Combatant[], getMod: ModLookup): Combatant[] {
  return [...list].sort((a, b) => compare(a, b, getMod));
}

function mapCombatant(combat: Combat, id: string, fn: (c: Combatant) => Combatant): Combat {
  return { ...combat, combatants: combat.combatants.map((c) => (c.id === id ? fn(c) : c)) };
}

function firstNotActed(combatants: readonly Combatant[], getMod: ModLookup): string | null {
  return sortCombatants(combatants, getMod).find((c) => !c.acted)?.id ?? null;
}

export function rollAll(combat: Combat, rng: Rng = Math.random): Combat {
  return {
    ...combat,
    combatants: combat.combatants.map((c) => (c.roll === null ? { ...c, roll: rollD20(rng) } : c)),
  };
}

export function setRoll(combat: Combat, id: string, roll: number | null): Combat {
  if (roll !== null && (!Number.isInteger(roll) || roll < 1 || roll > 20)) {
    throw new RangeError(`Tiro di d20 non valido: ${roll}`);
  }
  return mapCombatant(combat, id, (c) => ({ ...c, roll }));
}

export function addCombatant(combat: Combat, ref: Ref, idFn: () => string = createId): Combat {
  if (combat.combatants.some((c) => sameRef(c.ref, ref))) return combat;
  const order = combat.combatants.reduce((max, c) => Math.max(max, c.order), -1) + 1;
  return { ...combat, combatants: [...combat.combatants, { id: idFn(), ref, roll: null, acted: false, order, notes: "" }] };
}

export function addParty(combat: Combat, characters: readonly { id: string }[], idFn: () => string = createId): Combat {
  return characters.reduce((acc, ch) => addCombatant(acc, { kind: "pc", id: ch.id }, idFn), combat);
}

function nextNpcNumber(npcs: readonly Npc[], base: string): number {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
  return npcs.reduce((max, n) => {
    const m = pattern.exec(n.name);
    if (m) return Math.max(max, Number(m[1]));
    return n.name === base ? Math.max(max, 1) : max;
  }, 0) + 1;
}

export function addNpcs(
  combat: Combat,
  template: NpcTemplate,
  quantity: number,
  idFn: () => string = createId,
): { combat: Combat; npcs: Npc[] } {
  const qty = Math.max(1, Math.floor(quantity));
  const base = template.name.trim();
  const start = nextNpcNumber(combat.npcs, base);
  const numbered = qty > 1 || start > 1;
  const npcs: Npc[] = Array.from({ length: qty }, (_, i) => ({
    ...template,
    id: idFn(),
    name: numbered ? `${base} ${start + i}` : base,
  }));
  const next = npcs.reduce((acc, npc) => addCombatant(acc, { kind: "npc", id: npc.id }, idFn), {
    ...combat,
    npcs: [...combat.npcs, ...npcs],
  });
  return { combat: next, npcs };
}

export function setNotes(combat: Combat, id: string, notes: string): Combat {
  return { ...combat, combatants: combat.combatants.map((c) => (c.id === id ? { ...c, notes } : c)) };
}

export function updateNpc(combat: Combat, npcId: string, patch: Partial<NpcTemplate>): Combat {
  return { ...combat, npcs: combat.npcs.map((n) => (n.id === npcId ? { ...n, ...patch } : n)) };
}

export function removeCombatant(combat: Combat, id: string, getMod: ModLookup): Combat {
  const target = combat.combatants.find((c) => c.id === id);
  if (!target) return combat;
  const combatants = combat.combatants.filter((c) => c.id !== id);
  const npcs = target.ref.kind === "npc" ? combat.npcs.filter((n) => n.id !== target.ref.id) : combat.npcs;
  const currentId =
    combat.currentId === id && combat.active ? firstNotActed(combatants, getMod) : combat.currentId;
  return { ...combat, combatants, npcs, currentId };
}

/** Rimuove i combattenti che puntano a un PG eliminato dal party. */
export function removeRef(combat: Combat, ref: Ref, getMod: ModLookup): Combat {
  const target = combat.combatants.find((c) => sameRef(c.ref, ref));
  return target ? removeCombatant(combat, target.id, getMod) : combat;
}

export function startCombat(combat: Combat, getMod: ModLookup): Combat {
  if (combat.combatants.length === 0) throw new Error("Nessun combattente nell'iniziativa");
  const combatants = combat.combatants.map((c) => ({ ...c, acted: false }));
  return { ...combat, active: true, round: 1, combatants, currentId: firstNotActed(combatants, getMod) };
}

function newRound(combat: Combat, getMod: ModLookup): Combat {
  const combatants = combat.combatants.map((c) => ({ ...c, acted: false }));
  return { ...combat, round: combat.round + 1, combatants, currentId: firstNotActed(combatants, getMod) };
}

/** Il combattente di turno ha agito: passa al prossimo, o apre un nuovo round. */
export function nextTurn(combat: Combat, getMod: ModLookup): Combat {
  if (!combat.active || combat.combatants.length === 0) return combat;
  const marked = combat.currentId
    ? mapCombatant(combat, combat.currentId, (c) => ({ ...c, acted: true }))
    : combat;
  const currentId = firstNotActed(marked.combatants, getMod);
  return currentId === null ? newRound(marked, getMod) : { ...marked, currentId };
}

/**
 * Spunta / rimuove la spunta manualmente (anche fuori ordine).
 * Il turno passa al primo non spuntato; se hanno agito tutti resta vuoto finché non si preme "Turno successivo".
 */
export function toggleActed(combat: Combat, id: string, getMod: ModLookup): Combat {
  const toggled = mapCombatant(combat, id, (c) => ({ ...c, acted: !c.acted }));
  if (!combat.active) return toggled;
  return { ...toggled, currentId: firstNotActed(toggled.combatants, getMod) };
}

export function endCombat(combat: Combat): Combat {
  return {
    ...combat,
    active: false,
    round: 0,
    currentId: null,
    combatants: combat.combatants.map((c) => ({ ...c, roll: null, acted: false })),
  };
}

function tiedNeighbour(combat: Combat, id: string, dir: -1 | 1, getMod: ModLookup): Combatant | null {
  const sorted = sortCombatants(combat.combatants, getMod);
  const index = sorted.findIndex((c) => c.id === id);
  const self = sorted[index];
  const other = sorted[index + dir];
  if (!self || !other) return null;
  const tied = getTotal(self, getMod) === getTotal(other, getMod) && getMod(self.ref) === getMod(other.ref);
  return tied ? other : null;
}

/** Lo spostamento manuale è permesso solo tra vicini in perfetta parità. */
export function canMove(combat: Combat, id: string, dir: -1 | 1, getMod: ModLookup): boolean {
  return tiedNeighbour(combat, id, dir, getMod) !== null;
}

export function moveCombatant(combat: Combat, id: string, dir: -1 | 1, getMod: ModLookup): Combat {
  const other = tiedNeighbour(combat, id, dir, getMod);
  const self = combat.combatants.find((c) => c.id === id);
  if (!other || !self) return combat;
  return {
    ...combat,
    combatants: combat.combatants.map((c) =>
      c.id === self.id ? { ...c, order: other.order } : c.id === other.id ? { ...c, order: self.order } : c,
    ),
  };
}

/** Costruisce la lookup dei modificatori da party + PNG del combattimento. */
export function modLookupFrom(
  characters: readonly { id: string; initiativeMod: number }[],
  npcs: readonly { id: string; initiativeMod: number }[],
): ModLookup {
  const pcs = new Map(characters.map((c) => [c.id, c.initiativeMod]));
  const nps = new Map(npcs.map((n) => [n.id, n.initiativeMod]));
  return (ref) => (ref.kind === "pc" ? pcs.get(ref.id) : nps.get(ref.id)) ?? 0;
}
