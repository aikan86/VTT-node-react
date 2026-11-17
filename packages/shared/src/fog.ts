import { pointInPolygon } from "./visibility";
import type { Point } from "./grid";
import type { Ref } from "./schemas/common";
import { MAX_EXPLORED_CELLS, type Grid, type Scene } from "./schemas/scene";

/** Rettangolo in pixel del mondo. */
export interface PxBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type GridGeom = Pick<Grid, "cellPx" | "offsetX" | "offsetY">;

/** Chiave con cui una cella viene salvata in `scene.explored`. */
export const cellKey = (x: number, y: number): string => `${x},${y}`;

export function parseCellKey(key: string): Point {
  const [x = "0", y = "0"] = key.split(",");
  return { x: Number(x), y: Number(y) };
}

/**
 * Celle il cui centro cade dentro il poligono [x1, y1, x2, y2, ...] (pixel del mondo), limitate a `limit`.
 * Scansione per righe: per ogni riga di centri si trovano gli incroci con i lati e si riempie tra coppie (pari/dispari,
 * come `pointInPolygon`), così anche una visione senza limite costa quanto le celle dentro `limit`.
 */
export function cellsInPolygon(polygon: number[], g: GridGeom, limit: PxBounds): string[] {
  if (polygon.length < 6) return [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < polygon.length; i += 2) {
    minY = Math.min(minY, polygon[i]!);
    maxY = Math.max(maxY, polygon[i]!);
  }
  minY = Math.max(minY, limit.minY);
  maxY = Math.min(maxY, limit.maxY);
  if (minY > maxY) return [];

  const firstRow = Math.ceil((minY - g.offsetY) / g.cellPx - 0.5);
  const lastRow = Math.floor((maxY - g.offsetY) / g.cellPx - 0.5);
  const minCol = Math.ceil((limit.minX - g.offsetX) / g.cellPx - 0.5);
  const maxCol = Math.floor((limit.maxX - g.offsetX) / g.cellPx - 0.5);
  const cells: string[] = [];
  const xs: number[] = [];

  for (let row = firstRow; row <= lastRow; row++) {
    const cy = g.offsetY + (row + 0.5) * g.cellPx;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
      const xi = polygon[i]!;
      const yi = polygon[i + 1]!;
      const xj = polygon[j]!;
      const yj = polygon[j + 1]!;
      if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // centri cx con xs[k] < cx < xs[k+1]
      const from = Math.max(minCol, Math.floor((xs[k]! - g.offsetX) / g.cellPx - 0.5) + 1);
      const to = Math.min(maxCol, Math.ceil((xs[k + 1]! - g.offsetX) / g.cellPx - 0.5) - 1);
      for (let col = from; col <= to; col++) cells.push(cellKey(col, row));
    }
  }
  return cells;
}

/** Celle viste da almeno uno dei poligoni di visibilità, senza doppioni. */
export function visibleCells(polygons: number[][], g: GridGeom, limit: PxBounds): string[] {
  const seen = new Set<string>();
  for (const polygon of polygons) for (const key of cellsInPolygon(polygon, g, limit)) seen.add(key);
  return [...seen];
}

/**
 * Aggiunge alla memoria della scena le celle viste. Restituisce la stessa scena se non c'è nulla di nuovo
 * (così non parte nessun salvataggio); oltre `MAX_EXPLORED_CELLS` le nuove celle vengono ignorate.
 */
export function addExplored(scene: Scene, cells: string[]): Scene {
  const known = new Set(scene.explored);
  const added: string[] = [];
  for (const key of cells) {
    if (known.has(key)) continue;
    if (scene.explored.length + added.length >= MAX_EXPLORED_CELLS) break;
    known.add(key);
    added.push(key);
  }
  return added.length === 0 ? scene : { ...scene, explored: [...scene.explored, ...added] };
}

/** Dimentica le zone esplorate. */
export function resetExplored(scene: Scene): Scene {
  return scene.explored.length === 0 ? scene : { ...scene, explored: [] };
}

/** Celle esplorate raggruppate in strisce orizzontali (meno rettangoli da disegnare). Larghezza `w` in celle. */
export function exploredRuns(explored: readonly string[]): { x: number; y: number; w: number }[] {
  const cells = explored.map(parseCellKey).sort((a, b) => a.y - b.y || a.x - b.x);
  const runs: { x: number; y: number; w: number }[] = [];
  for (const c of cells) {
    const last = runs[runs.length - 1];
    if (last && last.y === c.y && last.x + last.w === c.x) last.w++;
    else if (!(last && last.y === c.y && c.x < last.x + last.w)) runs.push({ x: c.x, y: c.y, w: 1 });
  }
  return runs;
}

/**
 * Nella vista giocatori, con la visione attiva, i token che non sono personaggi giocanti compaiono solo se il party
 * li vede ora: nelle zone ricordate (in grigio) non devono svelare dove sono i nemici.
 */
export function withoutUnseenTokens(scene: Scene, polygons: number[][], sizeOf: (ref: Ref) => number | undefined): Scene {
  if (polygons.length === 0) return scene;
  const g = scene.grid;
  const tokens = scene.tokens.filter((t) => {
    if (t.ref.kind === "pc") return true;
    const half = ((sizeOf(t.ref) ?? 1) * g.cellPx) / 2;
    const center = { x: g.offsetX + t.x * g.cellPx + half, y: g.offsetY + t.y * g.cellPx + half };
    return polygons.some((p) => pointInPolygon(center, p));
  });
  return tokens.length === scene.tokens.length ? scene : { ...scene, tokens };
}
