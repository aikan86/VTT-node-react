import type { Hp } from "./schemas/common";

/** Applica danni consumando prima i PF temporanei. */
export function applyDamage(hp: Hp, amount: number): Hp {
  if (amount <= 0) return hp;
  const fromTemp = Math.min(hp.temp, amount);
  const rest = amount - fromTemp;
  return { ...hp, temp: hp.temp - fromTemp, current: Math.max(0, hp.current - rest) };
}

/** Cura fino al massimo; i PF temporanei non cambiano. */
export function applyHealing(hp: Hp, amount: number): Hp {
  if (amount <= 0) return hp;
  return { ...hp, current: Math.min(hp.max, hp.current + amount) };
}
