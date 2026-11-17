import { cellToPx, pxToCell, type Point } from "./grid";
import type { Grid } from "./schemas/scene";

/** Metri per piede secondo la convenzione di D&D: 5 ft = 1,5 m. */
export const METERS_PER_FOOT = 0.3;

export interface Measurement {
  /** Distanza in linea retta. */
  feet: number;
  meters: number;
  /** Passi sulla griglia muovendosi in 8 direzioni (ogni diagonale conta una casella). */
  cells: number;
}

/** Distanza tra due punti in pixel del mondo, secondo la scala della griglia (`feetPerCell` per casella di `cellPx`). */
export function measure(a: Point, b: Point, g: Pick<Grid, "cellPx" | "feetPerCell">): Measurement {
  const dx = Math.abs(b.x - a.x) / g.cellPx;
  const dy = Math.abs(b.y - a.y) / g.cellPx;
  const feet = Math.hypot(dx, dy) * g.feetPerCell;
  return { feet, meters: feet * METERS_PER_FOOT, cells: Math.round(Math.max(dx, dy)) };
}

/** Numero con al più un decimale e la virgola italiana: 7.5 → "7,5", 30 → "30". */
export const formatNumber = (value: number) => String(Math.round(value * 10) / 10).replace(".", ",");

/** "7,5 m · 25 ft" */
export const formatDistance = (m: Pick<Measurement, "feet" | "meters">) => `${formatNumber(m.meters)} m · ${formatNumber(m.feet)} ft`;

/** Centro della cella che contiene il punto (pixel del mondo). */
export function cellCenter(p: Point, g: Pick<Grid, "cellPx" | "offsetX" | "offsetY">): Point {
  const corner = cellToPx(pxToCell(p, g), g);
  return { x: corner.x + g.cellPx / 2, y: corner.y + g.cellPx / 2 };
}
