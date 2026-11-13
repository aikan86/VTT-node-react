import { create } from "zustand";
import { CharacterSchema, newCharacter, type Character } from "@vtt/shared";
import { api } from "../api/http";
import { createSaver } from "./debounce";
import { track } from "./statusStore";

export const PALETTE = ["#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

// Gli stati intermedi non validi (es. nome vuoto durante la digitazione) non vengono salvati.
const saver = createSaver<Character>(
  async (c) => (CharacterSchema.safeParse(c).success ? api.characters.update(c) : undefined),
  400,
);

interface PartyState {
  characters: Character[];
  loaded: boolean;
  load: () => Promise<void>;
  add: () => Promise<Character>;
  update: (id: string, patch: Partial<Character> | ((c: Character) => Character)) => void;
  /** Elimina solo il PG: per le dipendenze (iniziativa, token) usare `deleteCharacter` in actions.ts. */
  remove: (id: string) => Promise<void>;
}

export const usePartyStore = create<PartyState>((set, get) => ({
  characters: [],
  loaded: false,

  load: async () => {
    const characters = await api.characters.list();
    set({ characters, loaded: true });
  },

  add: async () => {
    const color = PALETTE[get().characters.length % PALETTE.length]!;
    const character = newCharacter({ name: `Personaggio ${get().characters.length + 1}`, color });
    await track(api.characters.create(character));
    set((s) => ({ characters: [...s.characters, character] }));
    return character;
  },

  update: (id, patch) => {
    let updated: Character | undefined;
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== id) return c;
        updated = typeof patch === "function" ? patch(c) : { ...c, ...patch };
        return updated;
      }),
    }));
    if (updated) saver.schedule(id, updated);
  },

  remove: async (id) => {
    saver.cancel(id);
    await track(api.characters.remove(id));
    set((s) => ({ characters: s.characters.filter((c) => c.id !== id) }));
  },
}));

export const flushParty = () => saver.flushAll();
