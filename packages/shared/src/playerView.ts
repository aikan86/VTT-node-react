import { sameRef } from "./schemas/common";
import type { Combat, Combatant } from "./schemas/combat";
import type { Scene, Token } from "./schemas/scene";
import type { Point } from "./grid";
import { sortCombatants, type ModLookup } from "./initiative";

/** La scena come la vedono i giocatori: senza i token nascosti dal master. */
export function playerScene(scene: Scene): Scene {
  return scene.tokens.some((t) => t.hidden) ? { ...scene, tokens: scene.tokens.filter((t) => !t.hidden) } : scene;
}

/** Dalla vista giocatori si possono spostare solo i PG non nascosti, e solo se il master lo permette nella scena. */
export function canPlayerMove(scene: Pick<Scene, "playersMoveParty">, token: Pick<Token, "ref" | "hidden">): boolean {
  return scene.playersMoveParty && token.ref.kind === "pc" && !token.hidden;
}

/** Sposta (dalla vista giocatori) il token `id` sulla cella; la scena resta identica se non è permesso o non cambia nulla. */
export function movePartyToken(scene: Scene, id: string, cell: Point): Scene {
  const token = scene.tokens.find((t) => t.id === id);
  if (!token || !canPlayerMove(scene, token)) return scene;
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
