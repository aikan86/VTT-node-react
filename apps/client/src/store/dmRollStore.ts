import { create } from "zustand";
import { newDmRoll, sortRollsByTime, type DmRoll } from "@vtt/shared";
import { api } from "../api/http";
import { reportError, track } from "./statusStore";

interface DmRollState {
  /** Dal più vecchio al più recente. */
  rolls: DmRoll[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (value: number) => void;
  remove: (id: string) => void;
}

/** Tiri del DM: aggiornamento ottimistico, annullato se il server rifiuta. */
export const useDmRollStore = create<DmRollState>((set) => ({
  rolls: [],
  loaded: false,

  load: async () => {
    const rolls = await api.dmRolls.list();
    set({ rolls: sortRollsByTime(rolls), loaded: true });
  },

  add: (value) => {
    const roll = newDmRoll(value);
    set((s) => ({ rolls: [...s.rolls, roll] }));
    track(api.dmRolls.create(roll)).catch((err: unknown) => {
      set((s) => ({ rolls: s.rolls.filter((r) => r.id !== roll.id) }));
      reportError(err);
    });
  },

  remove: (id) => {
    let removed: DmRoll | undefined;
    set((s) => {
      removed = s.rolls.find((r) => r.id === id);
      return { rolls: s.rolls.filter((r) => r.id !== id) };
    });
    if (!removed) return;
    const restore = removed;
    track(api.dmRolls.remove(id)).catch((err: unknown) => {
      set((s) => ({ rolls: sortRollsByTime([...s.rolls, restore]) }));
      reportError(err);
    });
  },
}));
