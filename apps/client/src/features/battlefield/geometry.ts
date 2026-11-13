import type { Background, Scene } from "@vtt/shared";

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

/** Dimensioni del "mondo" in pixel: immagine di sfondo o area della griglia, la maggiore. */
export function worldSize(scene: Scene): { width: number; height: number } {
  const g = scene.grid;
  const gridW = g.offsetX + g.cols * g.cellPx;
  const gridH = g.offsetY + g.rows * g.cellPx;
  const bg = scene.background ? backgroundBounds(scene.background) : null;
  return {
    width: Math.max(gridW, bg?.maxX ?? 0),
    height: Math.max(gridH, bg?.maxY ?? 0),
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
