import { z } from "zod";

export const IdSchema = z.string().min(1).max(64);

export const HpSchema = z.object({
  current: z.number().int(),
  max: z.number().int().min(0),
  temp: z.number().int().min(0).default(0),
});
export type Hp = z.infer<typeof HpSchema>;

export const RefSchema = z.object({
  kind: z.enum(["pc", "npc"]),
  id: IdSchema,
});
export type Ref = z.infer<typeof RefSchema>;

/** Taglia in celle occupate per lato (1 = Media/Piccola, 2 = Grande, 3 = Enorme, 4 = Mastodontica). */
export const SizeSchema = z.number().int().min(1).max(4);

/**
 * Indirizzo di un'immagine caricata nel VTT (`/uploads/...`), mai un indirizzo esterno: i documenti arrivano anche
 * da file d'importazione, e un URL arbitrario in `<img src>` caricherebbe risorse remote (beacon di tracciamento).
 */
export const UploadedImageUrlSchema = z.string().regex(/^\/uploads\/[\w-]{1,100}\.(png|jpg|webp|gif)$/, "Immagine caricata nel VTT");

/** Immagine del token (facoltativa). */
export const TokenImageSchema = UploadedImageUrlSchema.optional();

export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore esadecimale #rrggbb");

export function createId(): string {
  return globalThis.crypto.randomUUID();
}

export function sameRef(a: Ref, b: Ref): boolean {
  return a.kind === b.kind && a.id === b.id;
}
