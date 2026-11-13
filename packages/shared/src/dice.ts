export type Rng = () => number;

/** Tira un dado a `sides` facce. `rng` deve restituire un valore in [0, 1). */
export function rollDie(sides: number, rng: Rng = Math.random): number {
  if (!Number.isInteger(sides) || sides < 1) throw new RangeError(`Dado non valido: d${sides}`);
  return Math.floor(rng() * sides) + 1;
}

export function rollD20(rng: Rng = Math.random): number {
  return rollDie(20, rng);
}
