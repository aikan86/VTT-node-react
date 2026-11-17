import { z } from "zod";

/** Condizioni di D&D 3.5e (Guida del Dungeon Master, "Riepilogo delle condizioni"): chiave stabile salvata nei documenti. */
export const CONDITIONS = [
  "blinded",
  "confused",
  "cowering",
  "dazed",
  "dazzled",
  "deafened",
  "disabled",
  "dying",
  "entangled",
  "exhausted",
  "fascinated",
  "fatigued",
  "flatFooted",
  "frightened",
  "grappling",
  "helpless",
  "invisible",
  "nauseated",
  "panicked",
  "paralyzed",
  "petrified",
  "pinned",
  "prone",
  "shaken",
  "sickened",
  "stable",
  "staggered",
  "stunned",
  "unconscious",
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Condizioni della 5e salvate prima del passaggio alla 3.5e: l'equivalente più vicino. */
const LEGACY_CONDITIONS: Record<string, Condition> = {
  charmed: "fascinated",
  grappled: "grappling",
  incapacitated: "helpless",
  poisoned: "sickened",
  restrained: "entangled",
};

export const ConditionSchema = z.enum(CONDITIONS);
/**
 * Lista di condizioni di un PG o PNG (assente nei documenti salvati prima). Le chiavi della 5e vengono convertite
 * nell'equivalente 3.5e, quelle sconosciute scartate, i doppioni tolti: i documenti vecchi restano validi.
 */
export const ConditionsSchema = z
  .preprocess((value) => {
    if (!Array.isArray(value)) return value;
    const known = new Set<Condition>();
    for (const v of value) {
      const key = typeof v === "string" ? (LEGACY_CONDITIONS[v] ?? v) : v;
      if ((CONDITIONS as readonly unknown[]).includes(key)) known.add(key as Condition);
    }
    return CONDITIONS.filter((c) => known.has(c));
  }, z.array(ConditionSchema).max(CONDITIONS.length))
  .optional();

/** Nome (Manuale del Giocatore 3.5 in italiano) e icona di ogni condizione. Icone scelte fra quelle che Windows 10 mostra. */
export const CONDITION_INFO: Record<Condition, { label: string; icon: string }> = {
  blinded: { label: "Accecato", icon: "🙈" },
  confused: { label: "Confuso", icon: "❓" },
  cowering: { label: "Rannicchiato", icon: "😖" },
  dazed: { label: "Frastornato", icon: "🌀" },
  dazzled: { label: "Abbagliato", icon: "🔆" },
  deafened: { label: "Assordato", icon: "🔇" },
  disabled: { label: "Inabile", icon: "🤕" },
  dying: { label: "Morente", icon: "💀" },
  entangled: { label: "Intralciato", icon: "🕸" },
  exhausted: { label: "Esausto", icon: "😩" },
  fascinated: { label: "Affascinato", icon: "😍" },
  fatigued: { label: "Affaticato", icon: "😓" },
  flatFooted: { label: "Impreparato", icon: "😳" },
  frightened: { label: "Spaventato", icon: "😱" },
  grappling: { label: "In lotta", icon: "🤼" },
  helpless: { label: "Indifeso", icon: "🆘" },
  invisible: { label: "Invisibile", icon: "👻" },
  nauseated: { label: "Nauseato", icon: "🤢" },
  panicked: { label: "In preda al panico", icon: "🏃" },
  paralyzed: { label: "Paralizzato", icon: "⚡" },
  petrified: { label: "Pietrificato", icon: "🗿" },
  pinned: { label: "Immobilizzato", icon: "📌" },
  prone: { label: "Prono", icon: "🛌" },
  shaken: { label: "Scosso", icon: "😰" },
  sickened: { label: "Infermo", icon: "🤒" },
  stable: { label: "Stabile", icon: "💚" },
  staggered: { label: "Barcollante", icon: "🥴" },
  stunned: { label: "Stordito", icon: "💫" },
  unconscious: { label: "Privo di sensi", icon: "💤" },
};

/** Aggiunge o toglie la condizione, mantenendo l'ordine di `CONDITIONS` e senza doppioni. */
export function toggleCondition(list: readonly Condition[] | undefined, condition: Condition): Condition[] {
  const current = new Set(list ?? []);
  if (current.has(condition)) current.delete(condition);
  else current.add(condition);
  return CONDITIONS.filter((c) => current.has(c));
}
