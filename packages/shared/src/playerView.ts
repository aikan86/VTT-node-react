import { sameRef, type Ref } from "./schemas/common";
import type { Combat, Combatant } from "./schemas/combat";
import type { Scene, Token } from "./schemas/scene";
import type { Point } from "./grid";
import { sortCombatants, type ModLookup } from "./initiative";

/** La scena come la vedono i giocatori: senza i token nascosti dal master. */
export function playerScene(scene: Scene): Scene {
  return scene.tokens.some((t) => t.hidden) ? { ...scene, tokens: scene.tokens.filter((t) => !t.hidden) } : scene;
}

/**
 * Chi può muovere i giocatori: fuori dal combattimento tutti i PG ("any"); in combattimento solo il PG di turno,
 * nessuno (null) quando tocca a un PNG.
 */
export type PartyMover = "any" | Ref | null;

export function partyMover(combat: Pick<Combat, "active" | "currentId" | "combatants">): PartyMover {
  if (!combat.active) return "any";
  const current = combat.combatants.find((c) => c.id === combat.currentId);
  return current?.ref.kind === "pc" ? current.ref : null;
}

/** Vista del singolo giocatore: muove solo il proprio PG, e solo quando le regole del turno lo permettono. */
export function ownMover(mover: PartyMover, own: Ref): PartyMover {
  if (mover === "any") return own;
  return mover !== null && sameRef(mover, own) ? own : null;
}

/** Dalla vista giocatori si possono spostare solo i PG non nascosti, se il master lo permette nella scena e (in combattimento) nel loro turno. */
export function canPlayerMove(scene: Pick<Scene, "playersMoveParty">, token: Pick<Token, "ref" | "hidden">, mover: PartyMover = "any"): boolean {
  if (!scene.playersMoveParty || token.ref.kind !== "pc" || token.hidden || mover === null) return false;
  return mover === "any" || sameRef(mover, token.ref);
}

/** Sposta (dalla vista giocatori) il token `id` sulla cella; la scena resta identica se non è permesso o non cambia nulla. */
export function movePartyToken(scene: Scene, id: string, cell: Point, mover: PartyMover = "any"): Scene {
  const token = scene.tokens.find((t) => t.id === id);
  if (!token || !canPlayerMove(scene, token, mover)) return scene;
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || (token.x === cell.x && token.y === cell.y)) return scene;
  return { ...scene, tokens: scene.tokens.map((t) => (t === token ? { ...t, x: cell.x, y: cell.y } : t)) };
}

/**
 * Iniziativa visibile ai giocatori, in ordine: solo i combattenti presenti sulla mappa con almeno un token
 * non nascosto (chi è in iniziativa ma non è sulla mappa, o è nascosto, non compare).
 */
export function playerCombatants(combat: Combat, scene: Scene, getMod: ModLookup): Combatant[] {
  const visible = playerScene(scene).tokens;
  return sortCombatants(combat.combatants, getMod).filter((c) => visible.some((t) => sameRef(t.ref, c.ref)));
}
