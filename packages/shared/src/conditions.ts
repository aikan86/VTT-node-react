import { z } from "zod";

/** Condizioni di D&D 5e (più "esausto", senza livelli): chiave stabile salvata nei documenti. */
export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhausted",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const ConditionSchema = z.enum(CONDITIONS);
/** Lista di condizioni di un PG o PNG: assente nei documenti salvati prima. */
export const ConditionsSchema = z.array(ConditionSchema).max(CONDITIONS.length).optional();

export const CONDITION_INFO: Record<Condition, { label: string; icon: string }> = {
  blinded: { label: "Accecato", icon: "🙈" },
  charmed: { label: "Affascinato", icon: "💘" },
  deafened: { label: "Assordato", icon: "🔇" },
  exhausted: { label: "Esausto", icon: "🥱" },
  frightened: { label: "Spaventato", icon: "😱" },
  grappled: { label: "Afferrato", icon: "✊" },
  incapacitated: { label: "Incapacitato", icon: "⛔" },
  invisible: { label: "Invisibile", icon: "👻" },
  paralyzed: { label: "Paralizzato", icon: "⚡" },
  petrified: { label: "Pietrificato", icon: "🗿" },
  poisoned: { label: "Avvelenato", icon: "🤢" },
  prone: { label: "Prono", icon: "🛌" },
  restrained: { label: "Trattenuto", icon: "⛓" },
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
