import { create } from "zustand";
import { emptyCombat, modLookupFrom, type Combat, type ModLookup } from "@vtt/shared";
import { api } from "../api/http";
import { createSaver } from "./debounce";
import { usePartyStore } from "./partyStore";

const saver = createSaver<Combat>((c) => api.combat.put(c), 200);

interface CombatState {
  combat: Combat;
  loaded: boolean;
  load: () => Promise<void>;
  /** Applica una trasformazione pura (da @vtt/shared/initiative) e la persiste. */
  apply: (fn: (combat: Combat, getMod: ModLookup) => Combat) => void;
}

export function currentModLookup(combat: Combat): ModLookup {
  return modLookupFrom(usePartyStore.getState().characters, combat.npcs);
}

export const useCombatStore = create<CombatState>((set, get) => ({
  combat: emptyCombat(),
  loaded: false,

  load: async () => {
    const combat = await api.combat.get();
    set({ combat, loaded: true });
  },

  apply: (fn) => {
    const prev = get().combat;
    const next = fn(prev, currentModLookup(prev));
    if (next === prev) return;
    set({ combat: next });
    saver.schedule("combat", next);
  },
}));

export const flushCombat = () => saver.flushAll();
