import {
  addNpcs,
  createId,
  findFreeCells,
  removeCombatant,
  removeRef,
  sameRef,
  updateNpc,
  type Hp,
  type NpcTemplate,
  type Point,
  type Ref,
  type Scene,
} from "@vtt/shared";
import { useCombatStore } from "./combatStore";
import { usePartyStore } from "./partyStore";
import { useSceneStore } from "./sceneStore";

/** Azioni che coinvolgono più store (cascata su iniziativa e token). */

export async function deleteCharacter(id: string) {
  const ref: Ref = { kind: "pc", id };
  await usePartyStore.getState().remove(id);
  useCombatStore.getState().apply((combat, getMod) => removeRef(combat, ref, getMod));
  removeTokensFor(ref);
}

export function removeFromInitiative(combatantId: string) {
  const { combat } = useCombatStore.getState();
  const target = combat.combatants.find((c) => c.id === combatantId);
  useCombatStore.getState().apply((c, getMod) => removeCombatant(c, combatantId, getMod));
  // I PNG esistono solo nel combattimento: se escono dall'iniziativa spariscono anche dalla mappa.
  if (target?.ref.kind === "npc") removeTokensFor(target.ref);
}

export function removeTokensFor(ref: Ref) {
  useSceneStore.getState().updateAll((scene) =>
    scene.tokens.some((t) => sameRef(t.ref, ref))
      ? { ...scene, tokens: scene.tokens.filter((t) => !sameRef(t.ref, ref)) }
      : scene,
  );
}

export function setEntityColor(ref: Ref, color: string) {
  if (ref.kind === "pc") usePartyStore.getState().update(ref.id, { color });
  else useCombatStore.getState().apply((combat) => updateNpc(combat, ref.id, { color }));
}

export function setEntityHp(ref: Ref, hp: Hp) {
  if (ref.kind === "pc") {
    usePartyStore.getState().update(ref.id, { hp });
  } else {
    useCombatStore.getState().apply((combat) => ({
      ...combat,
      npcs: combat.npcs.map((n) => (n.id === ref.id ? { ...n, hp } : n)),
    }));
  }
}

/** Rinomina un PNG; i nomi vuoti vengono ignorati. */
export function renameNpc(npcId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  useCombatStore.getState().apply((combat) => updateNpc(combat, npcId, { name: trimmed }));
}

/** Crea PNG nel combattimento; restituisce i riferimenti creati. */
export function createNpcs(template: NpcTemplate, quantity: number): Ref[] {
  let refs: Ref[] = [];
  useCombatStore.getState().apply((combat) => {
    const result = addNpcs(combat, template, quantity);
    refs = result.npcs.map((n) => ({ kind: "npc", id: n.id }));
    return result.combat;
  });
  return refs;
}

/** Piazza token nella scena vicino a `start`, evitando le celle occupate. Ignora chi è già presente. */
export function placeTokens(sceneId: string, refs: Ref[], start: Point, sizeOf: (ref: Ref) => number) {
  useSceneStore.getState().update(sceneId, (scene: Scene) => {
    const missing = refs.filter((ref) => !scene.tokens.some((t) => sameRef(t.ref, ref)));
    const occupied = scene.tokens.map((t) => ({ x: t.x, y: t.y, size: sizeOf(t.ref) }));
    const spots = findFreeCells(occupied, missing.map(sizeOf), start, scene.grid);
    const tokens = spots.map((spot, i) => ({ id: createId(), ref: missing[i]!, x: spot.x, y: spot.y }));
    return tokens.length ? { ...scene, tokens: [...scene.tokens, ...tokens] } : scene;
  });
}

