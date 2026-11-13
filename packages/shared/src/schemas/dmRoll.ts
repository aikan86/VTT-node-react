import { z } from "zod";
import { IdSchema } from "./common";

/** Un tiro di d20 del DM, registrato a mano (risultato del dado, senza modificatori). */
export const DmRollSchema = z.object({
  id: IdSchema,
  value: z.number().int().min(1).max(20),
  /** Istante di registrazione (ISO 8601). */
  at: z.iso.datetime(),
});
export type DmRoll = z.infer<typeof DmRollSchema>;
