import { z } from "zod";
import { TokenImageSchema } from "./common";

/** Cosa mostrano le viste dei giocatori (schermo condiviso e telefono). Di default è tutto nascosto. */
export const PlayerViewSettingsSchema = z.object({
  /** Ordine di iniziativa (e di chi è il turno). */
  showInitiative: z.boolean().default(false),
  /** Barre dei PF sui token dei PNG. */
  showNpcHp: z.boolean().default(false),
  /** Barre dei PF sui token dei PG. */
  showPartyHp: z.boolean().default(false),
});
export type PlayerViewSettings = z.infer<typeof PlayerViewSettingsSchema>;

/** I default vengono dallo schema: un'unica fonte. */
export const defaultPlayerViewSettings = (): PlayerViewSettings => PlayerViewSettingsSchema.parse({});

/** Impostazioni generali del VTT: documento singleton con id "current" (versione 0 = mai salvato). */
export const SettingsSchema = z.object({
  /** Logo nell'intestazione: un'immagine caricata nel VTT; `null` = logo predefinito. */
  logoUrl: TokenImageSchema.nullable(),
  /** Assente nelle impostazioni salvate prima: vale il default (tutto nascosto). */
  playerView: PlayerViewSettingsSchema.default(defaultPlayerViewSettings),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SETTINGS_DOC_ID = "current";

export const defaultSettings = (): Settings => ({ logoUrl: null, playerView: defaultPlayerViewSettings() });
