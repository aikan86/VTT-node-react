import { pxToCell, type Background, type Grid, type Point, type Ref, type Scene } from "@vtt/shared";

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

/** Area occupata dal contenuto della scena (immagine, token, elementi, effetti), per "Adatta". */
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
  for (const fx of scene.effects) {
    const reach = fx.sizeFt / g.feetPerCell; // raggio, lato o lunghezza: approssimato per eccesso
    boxes.push(cellBox(fx.x - reach, fx.y - reach, reach * 2, reach * 2));
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
