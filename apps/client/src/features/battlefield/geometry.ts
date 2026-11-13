import type { Scene } from "@vtt/shared";

/** Dimensioni del "mondo" in pixel: immagine di sfondo o area della griglia, la maggiore. */
export function worldSize(scene: Scene): { width: number; height: number } {
  const g = scene.grid;
  const gridW = g.offsetX + g.cols * g.cellPx;
  const gridH = g.offsetY + g.rows * g.cellPx;
  return {
    width: Math.max(gridW, scene.background?.widthPx ?? 0),
    height: Math.max(gridH, scene.background?.heightPx ?? 0),
  };
}

/** Arrotonda al multiplo di `step` più vicino. */
export const snapTo = (value: number, step: number) => Math.round(value / step) * step;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
