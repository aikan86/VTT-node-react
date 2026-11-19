import { z } from "zod";
import { TokenImageSchema } from "./common";

/** Impostazioni generali del VTT: documento singleton con id "current" (versione 0 = mai salvato). */
export const SettingsSchema = z.object({
  /** Logo nell'intestazione: un'immagine caricata nel VTT; `null` = logo predefinito. */
  logoUrl: TokenImageSchema.nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SETTINGS_DOC_ID = "current";

export const defaultSettings = (): Settings => ({ logoUrl: null });
