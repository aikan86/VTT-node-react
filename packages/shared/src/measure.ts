import { cellToPx, pxToCell, type Point } from "./grid";
import type { Grid } from "./schemas/scene";

/** Metri per piede secondo la convenzione di D&D: 5 ft = 1,5 m. */
export const METERS_PER_FOOT = 0.3;

export interface Measurement {
  /** Caselle di movimento sulla griglia, con le diagonali della 3.5e (1 e 2 alternate: 5-10-5 ft). */
  cells: number;
  /** Distanza di gioco: le caselle per i piedi di una casella. */
  feet: number;
  meters: number;
  /** Distanza in linea retta, per riferimento. */
  straightFeet: number;
  straightMeters: number;
}

/** Caselle di movimento per uno spostamento di (dx, dy) caselle in D&D 3.5e: ogni seconda diagonale conta doppio. */
export const gridDistance = (dx: number, dy: number) => {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return Math.max(a, b) + Math.floor(Math.min(a, b) / 2);
};

/** Distanza tra due punti in pixel del mondo, secondo la scala della griglia (`feetPerCell` per casella di `cellPx`). */
export function measure(a: Point, b: Point, g: Pick<Grid, "cellPx" | "feetPerCell">): Measurement {
  const dx = Math.abs(b.x - a.x) / g.cellPx;
  const dy = Math.abs(b.y - a.y) / g.cellPx;
  const cells = gridDistance(Math.round(dx), Math.round(dy));
  const feet = cells * g.feetPerCell;
  const straightFeet = Math.hypot(dx, dy) * g.feetPerCell;
  return { cells, feet, meters: feet * METERS_PER_FOOT, straightFeet, straightMeters: straightFeet * METERS_PER_FOOT };
}

/** Numero con al più un decimale e la virgola italiana: 7.5 → "7,5", 30 → "30". */
export const formatNumber = (value: number) => String(Math.round(value * 10) / 10).replace(".", ",");

/** "7,5 m · 25 ft" */
export const formatDistance = (m: Pick<Measurement, "feet" | "meters">) => `${formatNumber(m.meters)} m · ${formatNumber(m.feet)} ft`;

/** "4 caselle" / "1 casella" (anche frazionarie: "2,5 caselle"). */
export const formatCells = (cells: number) => `${formatNumber(cells)} ${cells === 1 ? "casella" : "caselle"}`;

/** Un movimento in piedi, come lo mostra il righello: "6 m · 20 ft · 4 caselle". */
export const formatMove = (feet: number, feetPerCell: number) =>
  `${formatDistance({ feet, meters: feet * METERS_PER_FOOT })} · ${formatCells(feet / feetPerCell)}`;

/** Centro della cella che contiene il punto (pixel del mondo). */
export function cellCenter(p: Point, g: Pick<Grid, "cellPx" | "offsetX" | "offsetY">): Point {
  const corner = cellToPx(pxToCell(p, g), g);
  return { x: corner.x + g.cellPx / 2, y: corner.y + g.cellPx / 2 };
}
