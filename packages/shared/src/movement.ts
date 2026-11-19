import { cellKey } from "./fog";
import type { Point } from "./grid";
import type { Scene } from "./schemas/scene";
import { elementBlocksSight, pointInPolygon, rectCorners, type Segment } from "./visibility";

/** Velocità di un token che non ne ha una sua (camminare di un umanoide medio). */
export const DEFAULT_SPEED_FT = 30;

/** Posizione raggiungibile (angolo in alto a sinistra del token, in celle) e piedi spesi per arrivarci. */
export interface Reachable {
  x: number;
  y: number;
  costFt: number;
}

const EPS = 1e-9;

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Il segmento p1→p2 tocca il segmento s (estremi compresi)? I segmenti paralleli non si incontrano. */
function crosses(p1: Point, p2: Point, s: Segment): boolean {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) < EPS) return false;
  const qx = s.a.x - p1.x;
  const qy = s.a.y - p1.y;
  const t = cross(qx, qy, sx, sy) / denom;
  const u = cross(qx, qy, rx, ry) / denom;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boxOf = (corners: Point[]): Box => ({
  minX: Math.min(...corners.map((p) => p.x)),
  minY: Math.min(...corners.map((p) => p.y)),
  maxX: Math.max(...corners.map((p) => p.x)),
  maxY: Math.max(...corners.map((p) => p.y)),
});

const overlaps = (a: Box, b: Box) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * Posizioni che il token (angolo in alto a sinistra `from`, `size` celle per lato) raggiunge spendendo al più `budgetFt`.
 * Si muove in 8 direzioni con le regole di D&D 3.5e: le diagonali costano alternativamente 1 e 2 caselle (5-10-5 ft),
 * entrare in terreno difficile costa il doppio (3 caselle in diagonale). Muri, ostacoli, porte chiuse e forme tracciate
 * (a mano o con la bacchetta magica) non si attraversano né si occupano,
 * e in diagonale non si tagliano gli angoli: servono liberi entrambi i passi ortogonali.
 * Il risultato comprende la partenza (0 ft) ed è ordinato per costo.
 */
export function movementRange(
  scene: Pick<Scene, "elements" | "grid"> & Partial<Pick<Scene, "sightBlockers">>,
  from: Point,
  size: number,
  budgetFt: number,
): Reachable[] {
  const g = scene.grid;
  const maxSteps = Math.floor(budgetFt / g.feetPerCell + EPS);
  const start: Reachable = { x: from.x, y: from.y, costFt: 0 };
  if (maxSteps <= 0) return [start];

  // solo gli elementi che possono stare nella zona raggiungibile
  const region: Box = {
    minX: g.offsetX + (from.x - maxSteps - 1) * g.cellPx,
    minY: g.offsetY + (from.y - maxSteps - 1) * g.cellPx,
    maxX: g.offsetX + (from.x + size + maxSteps + 1) * g.cellPx,
    maxY: g.offsetY + (from.y + size + maxSteps + 1) * g.cellPx,
  };
  const walls: number[][] = [];
  const wallSegments: Segment[] = [];
  const difficult: number[][] = [];
  for (const el of scene.elements) {
    const corners = rectCorners(el, g);
    if (!overlaps(boxOf(corners), region)) continue;
    const polygon = corners.flatMap((p) => [p.x, p.y]);
    if (elementBlocksSight(el)) {
      walls.push(polygon);
      corners.forEach((a, i) => wallSegments.push({ a, b: corners[(i + 1) % corners.length]! }));
    } else if (el.type === "difficult") {
      difficult.push(polygon);
    }
  }
  // le forme tracciate a mano o con la bacchetta (edifici, roccia piena tra le stanze) non si attraversano
  for (const blocker of scene.sightBlockers ?? []) {
    const corners: Point[] = [];
    for (let i = 0; i + 1 < blocker.points.length; i += 2) {
      corners.push({ x: g.offsetX + blocker.points[i]! * g.cellPx, y: g.offsetY + blocker.points[i + 1]! * g.cellPx });
    }
    if (corners.length < 3 || !overlaps(boxOf(corners), region)) continue;
    walls.push(corners.flatMap((p) => [p.x, p.y]));
    corners.forEach((a, i) => wallSegments.push({ a, b: corners[(i + 1) % corners.length]! }));
  }

  const center = (x: number, y: number): Point => ({ x: g.offsetX + (x + 0.5) * g.cellPx, y: g.offsetY + (y + 0.5) * g.cellPx });
  const memo = (test: (p: Point) => boolean) => {
    const cache = new Map<string, boolean>();
    return (x: number, y: number) => {
      const key = cellKey(x, y);
      let v = cache.get(key);
      if (v === undefined) {
        v = test(center(x, y));
        cache.set(key, v);
      }
      return v;
    };
  };
  const cellBlocked = memo((p) => walls.some((poly) => pointInPolygon(p, poly)));
  const cellDifficult = memo((p) => difficult.some((poly) => pointInPolygon(p, poly)));
  const footprint = (x: number, y: number, test: (cx: number, cy: number) => boolean, every: boolean) => {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const hit = test(x + i, y + j);
        if (every ? !hit : hit) return !every;
      }
    }
    return every;
  };
  const free = (x: number, y: number) => footprint(x, y, (cx, cy) => !cellBlocked(cx, cy), true);
  const rough = (x: number, y: number) => footprint(x, y, cellDifficult, false);
  /** Da (x, y) a (x + dx, y + dy) nessun muro si mette di mezzo (per ogni casella occupata dal token). */
  const clear = (x: number, y: number, dx: number, dy: number) =>
    footprint(x, y, (cx, cy) => {
      const a = center(cx, cy);
      const b = center(cx + dx, cy + dy);
      return !wallSegments.some((s) => crosses(a, b, s));
    }, true);
  const canStep = (x: number, y: number, dx: number, dy: number) => {
    if (!free(x + dx, y + dy)) return false;
    if (dx === 0 || dy === 0) return clear(x, y, dx, dy);
    return (
      free(x + dx, y) && free(x, y + dy) && clear(x, y, dx, 0) && clear(x, y, 0, dy) && clear(x + dx, y, 0, dy) && clear(x, y + dy, dx, 0) && clear(x, y, dx, dy)
    );
  };

  // Dijkstra con code per costo. Lo stato è la posizione più la "parità" delle diagonali già fatte:
  // con parità 0 la prossima diagonale costa 1 casella, con parità 1 ne costa 2 (5-10-5 ft della 3.5e).
  type State = { x: number; y: number; odd: 0 | 1 };
  const stateKey = (s: State) => `${s.x},${s.y},${s.odd}`;
  const best = new Map<string, number>([[stateKey({ ...from, odd: 0 }), 0]]);
  const buckets: State[][] = Array.from({ length: maxSteps + 1 }, () => []);
  buckets[0]!.push({ x: from.x, y: from.y, odd: 0 });
  const settled = new Set<string>();
  const result: Reachable[] = [];
  for (let cost = 0; cost <= maxSteps; cost++) {
    for (const p of buckets[cost]!) {
      if (best.get(stateKey(p)) !== cost) continue; // già raggiunto più a buon mercato
      const pos = cellKey(p.x, p.y);
      if (!settled.has(pos)) {
        settled.add(pos);
        result.push({ x: p.x, y: p.y, costFt: cost * g.feetPerCell });
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = p.x + dx;
          const ny = p.y + dy;
          const diagonal = dx !== 0 && dy !== 0;
          const step = stepCost(diagonal, p.odd, rough(nx, ny));
          const next = cost + step;
          if (next > maxSteps) continue;
          const to: State = { x: nx, y: ny, odd: diagonal ? ((1 - p.odd) as 0 | 1) : p.odd };
          const key = stateKey(to);
          const known = best.get(key);
          if (known !== undefined && known <= next) continue;
          if (!canStep(p.x, p.y, dx, dy)) continue;
          best.set(key, next);
          buckets[next]!.push(to);
        }
      }
    }
  }
  return result;
}

/**
 * Caselle di movimento spese per un passo (D&D 3.5e): in orizzontale/verticale 1 (2 nel terreno difficile);
 * in diagonale 1 e 2 alternati (5-10-5 ft), e 3 se si entra in terreno difficile.
 */
export function stepCost(diagonal: boolean, odd: 0 | 1, rough: boolean): number {
  if (!diagonal) return rough ? 2 : 1;
  if (rough) return 3;
  return odd ? 2 : 1;
}

/** Caselle coperte dal token nelle posizioni raggiungibili, con il costo minimo per coprirle (chiave `cellKey`). */
export function coveredCells(range: Reachable[], size: number): Map<string, number> {
  const cells = new Map<string, number>();
  for (const r of range) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const key = cellKey(r.x + i, r.y + j);
        const known = cells.get(key);
        if (known === undefined || r.costFt < known) cells.set(key, r.costFt);
      }
    }
  }
  return cells;
}
