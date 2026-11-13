import type { Point } from "./grid";

export interface Footprint extends Point {
  size: number;
}

/**
 * Trova celle libere per piazzare token di varie taglie, il più vicino possibile a `start`.
 * A parità di distanza preferisce destra/basso, poi le righe più in alto.
 * Restituisce meno posizioni di `sizes.length` se la griglia è piena.
 */
export function findFreeCells(
  occupied: readonly Footprint[],
  sizes: readonly number[],
  start: Point,
  bounds: { cols: number; rows: number },
): Point[] {
  const taken = new Set<string>();
  const mark = (f: Footprint) => {
    for (let dx = 0; dx < f.size; dx++) for (let dy = 0; dy < f.size; dy++) taken.add(`${f.x + dx},${f.y + dy}`);
  };
  occupied.forEach(mark);

  const candidates: Point[] = [];
  for (let y = 0; y < bounds.rows; y++) for (let x = 0; x < bounds.cols; x++) candidates.push({ x, y });
  const rank = (p: Point) => {
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    return [dx * dx + dy * dy, dx >= 0 && dy >= 0 ? 0 : 1, p.y, p.x] as const;
  };
  candidates.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || ra[3] - rb[3];
  });

  const fits = (p: Point, size: number) => {
    if (p.x + size > bounds.cols || p.y + size > bounds.rows) return false;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (taken.has(`${p.x + dx},${p.y + dy}`)) return false;
    return true;
  };

  const result: Point[] = [];
  for (const size of sizes) {
    const spot = candidates.find((p) => fits(p, size));
    if (!spot) break;
    mark({ ...spot, size });
    result.push(spot);
  }
  return result;
}
