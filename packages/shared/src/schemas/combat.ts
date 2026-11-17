import { z } from "zod";
import { ConditionsSchema } from "../conditions";
import { ColorSchema, HpSchema, IdSchema, RefSchema, SizeSchema } from "./common";

/** PNG creato al volo: vive solo dentro il documento di combattimento. */
export const NpcSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(80),
    color: ColorSchema,
    hp: HpSchema,
    ac: z.number().int().min(0).max(50),
    initiativeMod: z.number().int().min(-20).max(30),
    size: SizeSchema.default(1),
    conditions: ConditionsSchema,
  })
  .loose();
export type Npc = z.infer<typeof NpcSchema>;

export const CombatantSchema = z.object({
  id: IdSchema,
  ref: RefSchema,
  /** Risultato del d20 (senza modificatore); null = non ancora tirato. */
  roll: z.number().int().min(1).max(20).nullable(),
  acted: z.boolean(),
  /** Usato solo per spareggiare a parità di totale e modificatore. */
  order: z.number().int(),
  /** Appunti di combattimento (condizioni, concentrazione, reazioni…). */
  notes: z.string().max(2000).default(""),
});
export type Combatant = z.infer<typeof CombatantSchema>;

export const CombatSchema = z.object({
  active: z.boolean(),
  round: z.number().int().min(0),
  currentId: IdSchema.nullable(),
  npcs: z.array(NpcSchema),
  combatants: z.array(CombatantSchema),
});
export type Combat = z.infer<typeof CombatSchema>;

export function emptyCombat(): Combat {
  return { active: false, round: 0, currentId: null, npcs: [], combatants: [] };
}
