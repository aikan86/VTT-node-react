import { z } from "zod";
import { CharacterSchema } from "./character";
import { CombatSchema } from "./combat";
import { DmRollSchema } from "./dmRoll";
import { HandoutSchema, MonsterSchema, NpcGroupSchema } from "./library";
import { SceneSchema } from "./scene";
import { SavedSceneSchema } from "../sceneLibrary";

export const EXPORT_FORMAT = "vtt-export";
export const EXPORT_VERSION = 1;

/** Tipi di immagine ammessi nei file caricati, con la relativa estensione. */
export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

/** Nome di un file in `uploads/`: niente percorsi, solo nome + estensione d'immagine. */
export const UploadNameSchema = z.string().regex(/^[\w-]{1,100}\.(png|jpg|webp|gif)$/, "Nome immagine non valido");

export const ExportedUploadSchema = z.object({
  type: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES, ...(keyof typeof IMAGE_TYPES)[]]),
  /** Contenuto del file in base64. */
  data: z.base64(),
});

/** Salvataggio completo dello stato (tutti i documenti + le immagini usate), per esportarlo e reimportarlo. */
export const StateExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.iso.datetime(),
  characters: z.array(CharacterSchema),
  scenes: z.array(SceneSchema),
  dmRolls: z.array(DmRollSchema),
  /** `null` = combattimento mai salvato. */
  combat: CombatSchema.nullable(),
  /** Assenti nei salvataggi fatti prima: all'importazione restano quelli attuali. */
  handouts: z.array(HandoutSchema).optional(),
  monsters: z.array(MonsterSchema).optional(),
  npcGroups: z.array(NpcGroupSchema).optional(),
  /** Libreria di scene (assente nei salvataggi fatti prima: resta quella attuale). */
  sceneLibrary: z.array(SavedSceneSchema).optional(),
  uploads: z.record(UploadNameSchema, ExportedUploadSchema),
});
export type StateExport = z.infer<typeof StateExportSchema>;
