/**
 * Bacchetta magica: dall'immagine della mappa ricava il contorno di un'area di colore uniforme.
 * 1. riempimento (flood fill, 4-connesso) dal pixel cliccato, entro una tolleranza di colore;
 * 2. tracciamento del contorno esterno lungo i bordi dei pixel (i buchi interni vengono ignorati);
 * 3. semplificazione dei vertici (Ramer-Douglas-Peucker).
 * Tutto in coordinate pixel dell'immagine: la conversione in celle la fa il client.
 */

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 byte per pixel (come `ImageData.data`). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Region {
  /** 1 = pixel nell'area. */
  mask: Uint8Array;
  width: number;
  height: number;
  count: number;
}

/**
 * Pixel 4-connessi al seme il cui colore dista al più `tolerance` (0-255, sul canale più diverso) da quello del seme.
 * I pixel quasi trasparenti contano come "nessun colore" e non vengono mai presi, salvo che lo sia anche il seme.
 */
export function floodFill(raster: Raster, seedX: number, seedY: number, tolerance: number): Region {
  const { width, height, data } = raster;
  const mask = new Uint8Array(width * height);
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { mask, width, height, count: 0 };
  const s = (sy * width + sx) * 4;
  const [r, g, b, a] = [data[s]!, data[s + 1]!, data[s + 2]!, data[s + 3]!];
  const seedTransparent = a < 16;
  const matches = (i: number) => {
    const o = i * 4;
    const transparent = data[o + 3]! < 16;
    if (transparent || seedTransparent) return transparent === seedTransparent;
    return Math.max(Math.abs(data[o]! - r), Math.abs(data[o + 1]! - g), Math.abs(data[o + 2]! - b)) <= tolerance;
  };
  // pila esplicita: niente ricorsione, regge aree di milioni di pixel
  const stack = new Int32Array(width * height);
  let top = 0;
  let count = 0;
  stack[top++] = sy * width + sx;
  mask[sy * width + sx] = 1;
  while (top > 0) {
    const i = stack[--top]!;
    count++;
    const x = i % width;
    const push = (j: number) => {
      if (!mask[j] && matches(j)) {
        mask[j] = 1;
        stack[top++] = j;
      }
    };
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < width * (height - 1)) push(i + width);
  }
  return { mask, width, height, count };
}

/**
 * Contorno esterno dell'area, come poligono [x1, y1, x2, y2, ...] sugli spigoli dei pixel (senso orario sullo schermo),
 * con un vertice solo dove il contorno cambia direzione. Vuoto se l'area è vuota.
 */
export function traceContour(region: Region): number[] {
  const { mask, width, height } = region;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const first = mask.indexOf(1);
  if (first < 0) return [];
  // primo pixel in alto a sinistra: si parte dal suo lato superiore, andando a destra, con l'area sulla destra
  const x0 = first % width;
  const y0 = Math.floor(first / width);
  let vx = x0 + 1;
  let vy = y0;
  let dx = 1;
  let dy = 0;
  const points = [x0, y0];
  const limit = 4 * (width + 1) * (height + 1);
  for (let step = 0; step < limit; step++) {
    if (vx === x0 && vy === y0) break;
    // pixel davanti a sinistra e a destra del vertice, rispetto alla direzione (dx, dy); a destra = (-dy, dx)
    const rx = -dy;
    const ry = dx;
    const aheadLeft = filled(vx + Math.min(0, dx) + Math.min(0, -rx), vy + Math.min(0, dy) + Math.min(0, -ry));
    const aheadRight = filled(vx + Math.min(0, dx) + Math.min(0, rx), vy + Math.min(0, dy) + Math.min(0, ry));
    let ndx = dx;
    let ndy = dy;
    if (aheadLeft) {
      ndx = dy; // svolta a sinistra
      ndy = -dx;
    } else if (!aheadRight) {
      ndx = -dy; // svolta a destra
      ndy = dx;
    }
    if (ndx !== dx || ndy !== dy) points.push(vx, vy);
    dx = ndx;
    dy = ndy;
    vx += dx;
    vy += dy;
  }
  return points;
}

/** Distanza del punto p dal segmento a-b. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const len2 = sx * sx + sy * sy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * sx + (py - ay) * sy) / len2));
  return Math.hypot(px - (ax + t * sx), py - (ay + t * sy));
}

/** Ramer-Douglas-Peucker su una spezzata aperta (estremi inclusi). */
function rdp(points: number[], epsilon: number): number[] {
  const n = points.length / 2;
  if (n < 3) return points;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worstDist = epsilon;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(points[2 * i]!, points[2 * i + 1]!, points[2 * from]!, points[2 * from + 1]!, points[2 * to]!, points[2 * to + 1]!);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([from, worst], [worst, to]);
    }
  }
  return points.filter((_, i) => keep[i >> 1]);
}

/** Semplifica un poligono chiuso: i vertici che si discostano meno di `epsilon` dal contorno semplificato vengono tolti. */
export function simplifyPolygon(polygon: number[], epsilon: number): number[] {
  const n = polygon.length / 2;
  if (n <= 3) return polygon;
  // si spezza nel vertice più lontano dal primo: due spezzate aperte da semplificare separatamente
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(polygon[2 * i]! - polygon[0]!, polygon[2 * i + 1]! - polygon[1]!);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const a = rdp(polygon.slice(0, 2 * far + 2), epsilon);
  const b = rdp([...polygon.slice(2 * far), polygon[0]!, polygon[1]!], epsilon);
  const result = [...a, ...b.slice(2, -2)];
  return result.length >= 6 ? result : polygon;
}

/** Semplifica finché i vertici non sono al più `maxVertices` (raddoppiando la tolleranza). */
export function simplifyToLimit(polygon: number[], epsilon: number, maxVertices: number): number[] {
  let eps = Math.max(epsilon, 0.01);
  let result = simplifyPolygon(polygon, eps);
  while (result.length / 2 > maxVertices && eps < 1e6) {
    eps *= 2;
    result = simplifyPolygon(polygon, eps);
  }
  return result;
}

export type WandResult =
  | { ok: true; polygon: number[]; pixels: number }
  | { ok: false; reason: "outside" | "too-small" | "too-large" };

export interface WandOptions {
  tolerance: number;
  /** Tolleranza della semplificazione, in pixel dell'immagine. */
  epsilon: number;
  /** Vertici al massimo (lo schema delle forme ne ammette 200). */
  maxVertices: number;
  /** Area minima, in pixel. */
  minPixels: number;
  /** Frazione massima dell'immagine (oltre si è preso il pavimento, non un ostacolo). */
  maxFraction: number;
}

export const DEFAULT_WAND: WandOptions = { tolerance: 32, epsilon: 1.5, maxVertices: 200, minPixels: 24, maxFraction: 0.5 };

/** Bacchetta magica completa: dal clic al poligono semplificato (pixel dell'immagine). */
export function magicWand(raster: Raster, x: number, y: number, options: Partial<WandOptions> = {}): WandResult {
  const o = { ...DEFAULT_WAND, ...options };
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return { ok: false, reason: "outside" };
  const region = floodFill(raster, x, y, o.tolerance);
  if (region.count < o.minPixels) return { ok: false, reason: "too-small" };
  if (region.count > raster.width * raster.height * o.maxFraction) return { ok: false, reason: "too-large" };
  const polygon = simplifyToLimit(traceContour(region), o.epsilon, o.maxVertices);
  return polygon.length >= 6 ? { ok: true, polygon, pixels: region.count } : { ok: false, reason: "too-small" };
}
