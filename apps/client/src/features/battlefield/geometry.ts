import { cellToPx, pxToCell, snapPxToCell, type Background, type Grid, type Point, type Ref, type Scene } from "@vtt/shared";
import { CLOSE_TRACE_SCREEN_PX } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rettangolo che contiene l'immagine di sfondo (ruotata attorno al suo centro). */
export function backgroundBounds(bg: Background): Bounds {
  const cx = bg.x + bg.widthPx / 2;
  const cy = bg.y + bg.heightPx / 2;
  const rad = (bg.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (bg.widthPx * cos + bg.heightPx * sin) / 2;
  const halfH = (bg.widthPx * sin + bg.heightPx * cos) / 2;
  return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
}

const EMPTY_AREA_CELLS = { cols: 30, rows: 20 };

/** Area occupata dal contenuto della scena (immagine, token, elementi, ostacoli alla vista, effetti, disegni), per "Adatta". */
export function contentBounds(scene: Scene, sizeOf: (ref: Ref) => number = () => 1): Bounds {
  const g = scene.grid;
  const boxes: Bounds[] = [];
  const cellBox = (x: number, y: number, w: number, h: number): Bounds => ({
    minX: g.offsetX + x * g.cellPx,
    minY: g.offsetY + y * g.cellPx,
    maxX: g.offsetX + (x + w) * g.cellPx,
    maxY: g.offsetY + (y + h) * g.cellPx,
  });
  if (scene.background) boxes.push(backgroundBounds(scene.background));
  for (const t of scene.tokens) {
    const size = sizeOf(t.ref);
    boxes.push(cellBox(t.x, t.y, size, size));
  }
  for (const el of scene.elements) boxes.push(cellBox(el.x, el.y, el.w, el.h));
  const pointsBox = (points: number[]) => {
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return cellBox(minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY);
  };
  for (const b of scene.sightBlockers) boxes.push(pointsBox(b.points));
  for (const fx of scene.effects) {
    const reach = fx.sizeFt / g.feetPerCell; // raggio, lato o lunghezza: approssimato per eccesso
    boxes.push(cellBox(fx.x - reach, fx.y - reach, reach * 2, reach * 2));
  }
  for (const d of scene.drawings) {
    if (d.kind === "text") {
      // stima per eccesso: larghezza media di un carattere ≈ 0,6 em
      const longest = Math.max(1, ...d.text.split("\n").map((l) => l.length));
      const lines = d.text.split("\n").length;
      boxes.push(cellBox(d.x, d.y, (longest * d.fontSize * 0.6) / g.cellPx, (lines * d.fontSize * 1.2) / g.cellPx));
    } else {
      boxes.push(pointsBox(d.points));
    }
  }
  if (boxes.length === 0) return cellBox(0, 0, EMPTY_AREA_CELLS.cols, EMPTY_AREA_CELLS.rows);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** Cella all'angolo in alto a destra del contenuto: punto di partenza per piazzare nuovi token lontano dal party. */
export function topRightCell(scene: Scene, sizeOf?: (ref: Ref) => number): Point {
  const b = contentBounds(scene, sizeOf);
  return pxToCell({ x: b.maxX - 1, y: b.minY }, scene.grid);
}

/** Sotto questa distanza tra le linee sullo schermo la griglia sarebbe solo rumore. */
const MIN_CELL_ON_SCREEN_PX = 4;

/** Linee della griglia (coordinate del mondo) che cadono nell'area visibile; null se troppo fitte. */
export function gridLines(
  g: Pick<Grid, "cellPx" | "offsetX" | "offsetY">,
  view: { x: number; y: number; scale: number },
  size: { width: number; height: number },
): { xs: number[]; ys: number[] } | null {
  if (g.cellPx * view.scale < MIN_CELL_ON_SCREEN_PX) return null;
  const axis = (offset: number, from: number, to: number) => {
    const lines: number[] = [];
    for (let v = offset + Math.floor((from - offset) / g.cellPx) * g.cellPx; v <= to; v += g.cellPx) lines.push(v);
    return lines;
  };
  return {
    xs: axis(g.offsetX, -view.x / view.scale, (size.width - view.x) / view.scale),
    ys: axis(g.offsetY, -view.y / view.scale, (size.height - view.y) / view.scale),
  };
}

/** Stato del nodo Konva dell'immagine: posizionato dal centro (offset = metà dimensioni), scala dal Transformer. */
export interface NodeTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/** Converte la posizione/trasformazione del nodo nello sfondo da salvare. */
export function backgroundFromNode(bg: Background, node: NodeTransform): Background {
  const widthPx = Math.max(1, Math.round(bg.widthPx * Math.abs(node.scaleX)));
  const heightPx = Math.max(1, Math.round(bg.heightPx * Math.abs(node.scaleY)));
  return {
    ...bg,
    widthPx,
    heightPx,
    x: Math.round(node.x - widthPx / 2),
    y: Math.round(node.y - heightPx / 2),
    rotation: ((Math.round(node.rotation) % 360) + 360) % 360,
  };
}

type GridGeom = Pick<Grid, "cellPx" | "offsetX" | "offsetY">;

/** Coordinata in celle arrotondata al millesimo: abbastanza precisa, documento più leggero. */
export const roundCell = (v: number) => Math.round(v * 1000) / 1000;

/** Lista appiattita [x1, y1, x2, y2, ...] da pixel del mondo a celle. */
export const pxPointsToCells = (points: number[], g: GridGeom) =>
  points.map((v, i) => roundCell((v - (i % 2 === 0 ? g.offsetX : g.offsetY)) / g.cellPx));

/** Lista appiattita [x1, y1, x2, y2, ...] da celle a pixel del mondo. */
export const cellPointsToPx = (points: number[], g: GridGeom) =>
  points.map((v, i) => (i % 2 === 0 ? g.offsetX : g.offsetY) + v * g.cellPx);

export const translatePoints = (points: number[], dx: number, dy: number) => points.map((v, i) => v + (i % 2 === 0 ? dx : dy));

/** Fine del segmento ruotata sul multiplo di `stepDeg` più vicino, mantenendo la lunghezza (Shift mentre si traccia). */
export function snapAngle(from: Point, to: Point, stepDeg = 45): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const step = (stepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
  return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
}

/** Il punto è abbastanza lontano dall'ultimo (o non c'è un ultimo) per essere aggiunto a un tratto? */
const farFrom = (last: Point | undefined, p: Point, minDist: number) => last === undefined || Math.hypot(p.x - last.x, p.y - last.y) >= minDist;

/** Aggiunge il punto al tratto a mano libera solo se dista almeno `minDist` dall'ultimo (stessa lista altrimenti). */
export function appendPoint(points: number[], p: Point, minDist: number): number[] {
  const [x, y] = points.slice(-2);
  const last = x !== undefined && y !== undefined ? { x, y } : undefined;
  return farFrom(last, p, minDist) ? [...points, p.x, p.y] : points;
}

/** Come `appendPoint`, per una lista di vertici, fermandosi a `max` vertici. */
export function appendVertex(points: Point[], p: Point, minDist: number, max: number): Point[] {
  return points.length < max && farFrom(points[points.length - 1], p, minDist) ? [...points, p] : points;
}

/** Un clic in `p` chiuderebbe la forma in tracciamento? (almeno 3 vertici e vicino al primo, in px sullo schermo) */
export function closesTrace(trace: Point[], p: Point | null, viewScale: number): boolean {
  const first = trace[0];
  return trace.length >= 3 && p !== null && first !== undefined && Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_TRACE_SCREEN_PX / viewScale;
}

/** Arrotonda al multiplo di `step` più vicino. */
export const snapTo = (value: number, step: number) => Math.round(value / step) * step;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Operazione sulla scena: aggiorna posizione/dimensioni/rotazione dello sfondo, se è ancora la stessa immagine. */
export function withBackgroundGeometry(scene: Scene, next: Pick<Background, "imageUrl" | "x" | "y" | "widthPx" | "heightPx" | "rotation">): Scene {
  const bg = scene.background;
  if (!bg || bg.imageUrl !== next.imageUrl) return scene;
  const { x, y, widthPx, heightPx, rotation } = next;
  return { ...scene, background: { ...bg, x, y, widthPx, heightPx, rotation } };
}

/** Metri per piede secondo la convenzione di D&D: 5 ft = 1,5 m. */
export const METERS_PER_FOOT = 0.3;

export type DistanceUnit = "cells" | "m" | "ft";

export const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: "m", label: "metri" },
  { value: "ft", label: "piedi" },
  { value: "cells", label: "caselle" },
];

/** Lunghezza di una cella nell'unità scelta (la griglia la definisce in piedi: `feetPerCell`). */
export function cellLengthIn(unit: DistanceUnit, feetPerCell: number): number {
  if (unit === "cells") return 1;
  return unit === "ft" ? feetPerCell : feetPerCell * METERS_PER_FOOT;
}

const MIN_BACKGROUND_SIDE_PX = 1;
const MAX_BACKGROUND_SIDE_PX = 40000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Calibra l'immagine: `p1` e `p2` (pixel del mondo, sull'immagine) distano `cells` caselle.
 * L'immagine viene scalata attorno a `p1` (che resta fermo), senza cambiare la rotazione.
 * Con `alignToGrid` l'immagine viene poi spostata perché `p1` cada sull'incrocio di griglia più vicino.
 * Restituisce null se i punti coincidono, la distanza non è valida o l'immagine uscirebbe dai limiti.
 */
export function calibrateBackground(
  bg: Background,
  p1: Point,
  p2: Point,
  cells: number,
  grid: Pick<Grid, "cellPx" | "offsetX" | "offsetY">,
  alignToGrid = false,
): Background | null {
  const pixelDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(pixelDistance > 0) || !(cells > 0) || !Number.isFinite(cells)) return null;
  const k = (cells * grid.cellPx) / pixelDistance;
  const widthPx = round2(bg.widthPx * k);
  const heightPx = round2(bg.heightPx * k);
  if ([widthPx, heightPx].some((side) => side < MIN_BACKGROUND_SIDE_PX || side > MAX_BACKGROUND_SIDE_PX)) return null;

  // il centro (attorno a cui ruota l'immagine) si sposta insieme alla scala, rispetto a p1
  let cx = p1.x + k * (bg.x + bg.widthPx / 2 - p1.x);
  let cy = p1.y + k * (bg.y + bg.heightPx / 2 - p1.y);
  if (alignToGrid) {
    const corner = cellToPx(snapPxToCell(p1, grid), grid);
    cx += corner.x - p1.x;
    cy += corner.y - p1.y;
  }
  return { ...bg, widthPx, heightPx, x: round2(cx - widthPx / 2), y: round2(cy - heightPx / 2) };
}
