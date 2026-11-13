import { create } from "zustand";
import { emptyCombat, modLookupFrom, type Combat, type ModLookup, type Versioned } from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { usePartyStore } from "./partyStore";
import { reportError, track } from "./statusStore";
import { DocSync, type OpContext } from "./sync/docSync";

/** Trasformazione pura del combattimento: per id e tiri casuali usare `ctx` (rieseguibile in modo identico). */
export type CombatOp = (combat: Combat, getMod: ModLookup, ctx: OpContext) => Combat;

interface CombatState {
  combat: Combat;
  loaded: boolean;
  load: () => Promise<void>;
  /** Imposta lo stato noto del server (avvio, test). */
  hydrate: (v: Versioned<Combat>) => void;
  /** Applica una trasformazione pura (da @vtt/shared/initiative) e la persiste. */
  apply: (fn: CombatOp) => void;
}

export function currentModLookup(combat: Combat): ModLookup {
  return modLookupFrom(usePartyStore.getState().characters, combat.npcs);
}

function createSync(initial: Versioned<Combat>) {
  return new DocSync<Combat>(initial, {
    save: (combat, rev) => track(api.combat.put(combat, rev)),
    onChange: (combat) => useCombatStore.setState({ combat }),
    onError: reportError,
    isPermanent: isPermanentError,
    delayMs: 200,
  });
}

let combatSync = createSync({ rev: 0, data: emptyCombat() });

export const useCombatStore = create<CombatState>((set, get) => ({
  combat: emptyCombat(),
  loaded: false,

  load: async () => get().hydrate(await api.combat.get()),

  hydrate: (v) => {
    combatSync.dispose();
    combatSync = createSync(v);
    set({ combat: v.data, loaded: true });
  },

  apply: (fn) => {
    combatSync.apply((combat, ctx) => fn(combat, currentModLookup(combat), ctx));
  },
}));

/** Modifica arrivata da un altro tab (il documento sul server ha anche il campo id). */
export function receiveCombat(rev: number, data: unknown) {
  if (data === null) return;
  const { id: _id, ...combat } = data as Combat & { id?: string };
  combatSync.receive({ rev, data: combat });
}

export async function resyncCombat() {
  const v = await api.combat.get();
  combatSync.receive(v);
}

export const flushCombat = () => combatSync.flush();
