import { create } from "zustand";
import { newDmRoll, sortRollsByTime, type DmRoll, type Versioned } from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { reportError, track } from "./statusStore";
import { CollectionSync } from "./sync/collectionSync";

interface DmRollState {
  /** Dal più vecchio al più recente. */
  rolls: DmRoll[];
  loaded: boolean;
  load: () => Promise<void>;
  hydrate: (list: Versioned<DmRoll>[]) => void;
  add: (value: number) => void;
  remove: (id: string) => void;
}

export const dmRollSync = new CollectionSync<DmRoll>({
  api: {
    list: () => api.dmRolls.list(),
    create: (r) => track(api.dmRolls.create(r)),
    update: (r, rev) => track(api.dmRolls.update(r, rev)),
    remove: (id) => track(api.dmRolls.remove(id)),
  },
  delayMs: 200,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (rolls) => useDmRollStore.setState({ rolls: sortRollsByTime(rolls) }),
});

/** Tiri del DM: aggiunta ed eliminazione immediate, sincronizzate con gli altri tab. */
export const useDmRollStore = create<DmRollState>((set) => ({
  rolls: [],
  loaded: false,

  load: async () => {
    await dmRollSync.load();
    set({ loaded: true });
  },

  hydrate: (list) => {
    dmRollSync.hydrate(list);
    set({ loaded: true });
  },

  add: (value) => {
    dmRollSync.create(newDmRoll(value)).catch(() => undefined); // errore già segnalato, il tiro viene rimosso
  },

  remove: (id) => {
    void dmRollSync.remove(id);
  },
}));
