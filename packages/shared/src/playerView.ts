import { sameRef } from "./schemas/common";
import type { Combat, Combatant } from "./schemas/combat";
import type { Scene } from "./schemas/scene";
import { sortCombatants, type ModLookup } from "./initiative";

/** La scena come la vedono i giocatori: senza i token nascosti dal master. */
export function playerScene(scene: Scene): Scene {
  return scene.tokens.some((t) => t.hidden) ? { ...scene, tokens: scene.tokens.filter((t) => !t.hidden) } : scene;
}

/**
 * Iniziativa visibile ai giocatori, in ordine: solo i combattenti presenti sulla mappa con almeno un token
 * non nascosto (chi è in iniziativa ma non è sulla mappa, o è nascosto, non compare).
 */
export function playerCombatants(combat: Combat, scene: Scene, getMod: ModLookup): Combatant[] {
  const visible = playerScene(scene).tokens;
  return sortCombatants(combat.combatants, getMod).filter((c) => visible.some((t) => sameRef(t.ref, c.ref)));
}
