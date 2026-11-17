import { z } from "zod";
import { ColorSchema, IdSchema, SizeSchema, createId } from "./common";

/** Immagine che il master mostra a schermo intero ai giocatori (una lettera, una mappa del tesoro, un ritratto…). */
export const HandoutSchema = z.object({
  id: IdSchema,
  title: z.string().trim().min(1).max(120),
  /** Indirizzo dell'immagine caricata (`/uploads/...`). */
  imageUrl: z.string().min(1).max(500),
  /** Quando è stato mostrato ai giocatori; null = non mostrato. Se più d'uno, vale il più recente. */
  shownAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Handout = z.infer<typeof HandoutSchema>;

export function newHandout(title: string, imageUrl: string, now = new Date()): Handout {
  return { id: createId(), title: title.trim(), imageUrl, shownAt: null, createdAt: now.toISOString() };
}

/** Statistiche di un mostro: bastano per creare un PNG (PF massimi, CA, modificatore d'iniziativa, taglia). */
export const MonsterStatsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hp: z.number().int().min(1).max(9999),
  ac: z.number().int().min(0).max(50),
  initiativeMod: z.number().int().min(-20).max(30),
  size: SizeSchema,
  color: ColorSchema,
  /** Grado di sfida, solo informativo ("1/4", "5"…). */
  cr: z.string().trim().max(10).optional(),
});
export type MonsterStats = z.infer<typeof MonsterStatsSchema>;

/** Mostro del bestiario del master (importato da file o salvato dal dialogo). */
export const MonsterSchema = MonsterStatsSchema.extend({ id: IdSchema });
export type Monster = z.infer<typeof MonsterSchema>;

/** Gruppo di PNG pronto da piazzare: per esempio "Banda di goblin" = 4 Goblin + 1 Capo goblin. */
export const NpcGroupSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(80),
  members: z
    .array(z.object({ monster: MonsterStatsSchema, quantity: z.number().int().min(1).max(30) }))
    .min(1)
    .max(20),
});
export type NpcGroup = z.infer<typeof NpcGroupSchema>;
export type NpcGroupMember = NpcGroup["members"][number];
