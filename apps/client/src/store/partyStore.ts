import { create } from "zustand";
import { CharacterSchema, newCharacter, type Character, type Versioned } from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { reportError, track } from "./statusStore";
import { CollectionSync } from "./sync/collectionSync";

export const PALETTE = ["#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

interface PartyState {
  characters: Character[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Imposta lo stato noto del server (avvio, test). */
  hydrate: (list: Versioned<Character>[]) => void;
  add: () => Promise<Character>;
  update: (id: string, patch: Partial<Character> | ((c: Character) => Character)) => void;
  /** Elimina solo il PG: per le dipendenze (iniziativa, token) usare `deleteCharacter` in actions.ts. */
  remove: (id: string) => Promise<void>;
}

export const partySync = new CollectionSync<Character>({
  api: {
    list: () => api.characters.list(),
    create: (c) => track(api.characters.create(c)),
    update: (c, rev) => track(api.characters.update(c, rev)),
    remove: (id) => track(api.characters.remove(id)),
  },
  delayMs: 400,
  // Gli stati intermedi non validi (es. nome vuoto durante la digitazione) non vengono salvati.
  canSave: (c) => CharacterSchema.safeParse(c).success,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (characters) => usePartyStore.setState({ characters }),
});

export const usePartyStore = create<PartyState>((set, get) => ({
  characters: [],
  loaded: false,

  load: async () => {
    await partySync.load();
    set({ loaded: true });
  },

  hydrate: (list) => {
    partySync.hydrate(list);
    set({ loaded: true });
  },

  add: async () => {
    const color = PALETTE[get().characters.length % PALETTE.length]!;
    const character = newCharacter({ name: `Personaggio ${get().characters.length + 1}`, color });
    await partySync.create(character);
    return character;
  },

  update: (id, patch) => partySync.update(id, (c) => (typeof patch === "function" ? patch(c) : { ...c, ...patch })),

  remove: (id) => partySync.remove(id),
}));

export const flushParty = () => partySync.flushAll();
