/** Schiarisce (amount > 0) o scurisce (amount < 0) un colore #rrggbb: 1 = bianco, -1 = nero. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (target - v) * t));
  return `#${channels.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
