import { z } from "zod";
import { ConditionsSchema } from "../conditions";
import { ColorSchema, HpSchema, IdSchema, SizeSchema, createId } from "./common";

export const SAVE_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type SaveKey = (typeof SAVE_KEYS)[number];

export const SAVE_LABELS: Record<SaveKey, string> = {
  str: "FOR",
  dex: "DES",
  con: "COS",
  int: "INT",
  wis: "SAG",
  cha: "CAR",
};

const Mod = z.number().int().min(-20).max(30);

export const SavesSchema = z.object({
  str: Mod,
  dex: Mod,
  con: Mod,
  int: Mod,
  wis: Mod,
  cha: Mod,
});
export type Saves = z.infer<typeof SavesSchema>;

/**
 * Personaggio giocante. `.loose()` mantiene eventuali campi aggiuntivi
 * così il modello può crescere senza migrazioni distruttive.
 */
export const CharacterSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(80),
    color: ColorSchema,
    hp: HpSchema,
    ac: z.number().int().min(0).max(50),
    initiativeMod: Mod,
    saves: SavesSchema,
    notes: z.string().max(20_000).default(""),
    size: SizeSchema.default(1),
    /** Condizioni in corso (accecato, prono…): mostrate sul token e nell'iniziativa. */
    conditions: ConditionsSchema,
  })
  .loose();
export type Character = z.infer<typeof CharacterSchema>;

export function newCharacter(partial: Partial<Character> = {}): Character {
  return {
    id: createId(),
    name: "Nuovo personaggio",
    color: "#3b82f6",
    hp: { current: 10, max: 10, temp: 0 },
    ac: 10,
    initiativeMod: 0,
    saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    notes: "",
    size: 1,
    ...partial,
  };
}
