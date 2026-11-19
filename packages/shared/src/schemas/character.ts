import { z } from "zod";
import { ConditionsSchema } from "../conditions";
import { ColorSchema, HpSchema, IdSchema, SizeSchema, TokenImageSchema, createId } from "./common";

/** Tiri salvezza di D&D 3.5e. */
export const SAVE_KEYS = ["fort", "ref", "will"] as const;
export type SaveKey = (typeof SAVE_KEYS)[number];

export const SAVE_LABELS: Record<SaveKey, string> = {
  fort: "Tempra",
  ref: "Riflessi",
  will: "Volontà",
};

const Mod = z.number().int().min(-20).max(30);

/**
 * Bonus ai tiri salvezza. Le schede salvate prima (6 tiri salvezza della 5e, uno per caratteristica) vengono convertite
 * con la caratteristica corrispondente: Costituzione → Tempra, Destrezza → Riflessi, Saggezza → Volontà.
 */
export const SavesSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || "fort" in value) return value;
    const old = value as Record<string, unknown>;
    return { fort: old.con ?? 0, ref: old.dex ?? 0, will: old.wis ?? 0 };
  },
  z.object({ fort: Mod, ref: Mod, will: Mod }),
);
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
    /** Immagine nel cerchio del token. */
    imageUrl: TokenImageSchema,
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
    saves: { fort: 0, ref: 0, will: 0 },
    notes: "",
    size: 1,
    ...partial,
  };
}
