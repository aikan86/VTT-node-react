import { useCallback } from "react";
import type { Hp, Ref } from "@vtt/shared";
import { useCombatStore } from "./combatStore";
import { usePartyStore } from "./partyStore";

/** Vista comune di PG e PNG per tracker e mappa. */
export interface EntityView {
  ref: Ref;
  name: string;
  color: string;
  hp: Hp;
  ac: number;
  initiativeMod: number;
  size: number;
}

export type EntityResolver = (ref: Ref) => EntityView | undefined;

export function useEntityResolver(): EntityResolver {
  const characters = usePartyStore((s) => s.characters);
  const npcs = useCombatStore((s) => s.combat.npcs);
  return useCallback(
    (ref: Ref) => {
      const e = ref.kind === "pc" ? characters.find((c) => c.id === ref.id) : npcs.find((n) => n.id === ref.id);
      return e
        ? { ref, name: e.name, color: e.color, hp: e.hp, ac: e.ac, initiativeMod: e.initiativeMod, size: e.size }
        : undefined;
    },
    [characters, npcs],
  );
}

/** Taglia letta direttamente dagli store (utile subito dopo una mutazione, fuori dal render). */
export function sizeOfRef(ref: Ref): number {
  const e =
    ref.kind === "pc"
      ? usePartyStore.getState().characters.find((c) => c.id === ref.id)
      : useCombatStore.getState().combat.npcs.find((n) => n.id === ref.id);
  return e?.size ?? 1;
}
