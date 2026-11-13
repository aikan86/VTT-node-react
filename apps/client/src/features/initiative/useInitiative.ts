import { useMemo } from "react";
import {
  addParty,
  canMove,
  endCombat,
  getTotal,
  moveCombatant,
  nextTurn,
  rollAll,
  setRoll,
  sortCombatants,
  startCombat,
  toggleActed,
  modLookupFrom,
  type Combatant,
} from "@vtt/shared";
import { useCombatStore } from "../../store/combatStore";
import { usePartyStore } from "../../store/partyStore";
import { useEntityResolver, type EntityView } from "../../store/entities";

export interface CombatantRowData {
  combatant: Combatant;
  entity: EntityView;
  total: number | null;
  current: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/** Dati ordinati e azioni del tracker, condivisi tra pagina Iniziativa e mappa. */
export function useInitiative() {
  const combat = useCombatStore((s) => s.combat);
  const apply = useCombatStore((s) => s.apply);
  const characters = usePartyStore((s) => s.characters);
  const resolve = useEntityResolver();

  const rows = useMemo<CombatantRowData[]>(() => {
    const getMod = modLookupFrom(characters, combat.npcs);
    return sortCombatants(combat.combatants, getMod).flatMap((c) => {
      const entity = resolve(c.ref);
      if (!entity) return [];
      return [
        {
          combatant: c,
          entity,
          total: getTotal(c, getMod),
          current: combat.active && combat.currentId === c.id,
          canMoveUp: canMove(combat, c.id, -1, getMod),
          canMoveDown: canMove(combat, c.id, 1, getMod),
        },
      ];
    });
  }, [combat, characters, resolve]);

  const missingPcs = characters.filter((ch) => !combat.combatants.some((c) => c.ref.kind === "pc" && c.ref.id === ch.id));
  const current = rows.find((r) => r.current);

  return {
    combat,
    rows,
    current,
    missingPcs,
    actions: {
      start: () => apply(startCombat),
      next: () => apply(nextTurn),
      end: () => apply(endCombat),
      rollAll: () => apply((c) => rollAll(c)),
      addParty: () => apply((c) => addParty(c, characters)),
      setRoll: (id: string, roll: number | null) => apply((c) => setRoll(c, id, roll)),
      toggleActed: (id: string) => apply((c, getMod) => toggleActed(c, id, getMod)),
      move: (id: string, dir: -1 | 1) => apply((c, getMod) => moveCombatant(c, id, dir, getMod)),
    },
  };
}
