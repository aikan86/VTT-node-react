import { createId } from "./schemas/common";
import type { DmRoll } from "./schemas/dmRoll";

export const D20_FACES = 20;

type Rolled = Pick<DmRoll, "value">;

export function newDmRoll(value: number, now: Date = new Date()): DmRoll {
  if (!Number.isInteger(value) || value < 1 || value > D20_FACES) throw new RangeError(`Tiro non valido: ${value}`);
  return { id: createId(), value, at: now.toISOString() };
}

/** Frequenza di ogni faccia: indice 0 = faccia 1, indice 19 = faccia 20. */
export function faceCounts(rolls: readonly Rolled[]): number[] {
  const counts = new Array<number>(D20_FACES).fill(0);
  for (const { value } of rolls) {
    if (Number.isInteger(value) && value >= 1 && value <= D20_FACES) counts[value - 1]! += 1;
  }
  return counts;
}

export function rollMean(rolls: readonly Rolled[]): number | null {
  if (rolls.length === 0) return null;
  return rolls.reduce((sum, r) => sum + r.value, 0) / rolls.length;
}

/** Dal più vecchio al più recente (ordinamento stabile a parità di istante). */
export function sortRollsByTime<T extends Pick<DmRoll, "at">>(rolls: readonly T[]): T[] {
  return [...rolls].sort((a, b) => a.at.localeCompare(b.at));
}
