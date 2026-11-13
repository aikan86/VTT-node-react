import type { Grid } from "./schemas/scene";

export interface Point {
  x: number;
  y: number;
}

type GridGeom = Pick<Grid, "cellPx" | "offsetX" | "offsetY">;

/** Pixel dell'angolo in alto a sinistra della cella. */
export function cellToPx(cell: Point, g: GridGeom): Point {
  return { x: g.offsetX + cell.x * g.cellPx, y: g.offsetY + cell.y * g.cellPx };
}

/** Cella che contiene il punto in pixel. */
export function pxToCell(p: Point, g: GridGeom): Point {
  return { x: Math.floor((p.x - g.offsetX) / g.cellPx), y: Math.floor((p.y - g.offsetY) / g.cellPx) };
}

/** Aggancia l'angolo in alto a sinistra trascinato alla cella più vicina. */
export function snapPxToCell(p: Point, g: GridGeom): Point {
  return { x: Math.round((p.x - g.offsetX) / g.cellPx), y: Math.round((p.y - g.offsetY) / g.cellPx) };
}

export function feetToCells(feet: number, g: Pick<Grid, "feetPerCell">): number {
  return feet / g.feetPerCell;
}

export function feetToPx(feet: number, g: Pick<Grid, "feetPerCell" | "cellPx">): number {
  return feetToCells(feet, g) * g.cellPx;
}
