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
  const { width, height } = raster;
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { mask: new Uint8Array(width * height), width, height, count: 0 };
  const matches = colorMatcher(raster, sx, sy, tolerance);
  return fillFrom(width, height, sy * width + sx, matches);
}

/** Il colore del pixel i è entro la tolleranza da quello del seme? */
function colorMatcher(raster: Raster, sx: number, sy: number, tolerance: number): (i: number) => boolean {
  const { width, data } = raster;
  const s = (sy * width + sx) * 4;
  const [r, g, b, a] = [data[s]!, data[s + 1]!, data[s + 2]!, data[s + 3]!];
  const seedTransparent = a < 16;
  return (i: number) => {
    const o = i * 4;
    const transparent = data[o + 3]! < 16;
    if (transparent || seedTransparent) return transparent === seedTransparent;
    return Math.max(Math.abs(data[o]! - r), Math.abs(data[o + 1]! - g), Math.abs(data[o + 2]! - b)) <= tolerance;
  };
}

/** Riempimento 4-connesso dal pixel `seed` attraverso i pixel ammessi. */
function fillFrom(width: number, height: number, seed: number, allowed: (i: number) => boolean): Region {
  const mask = new Uint8Array(width * height);
  // pila esplicita: niente ricorsione, regge aree di milioni di pixel
  const stack = new Int32Array(width * height);
  let top = 0;
  let count = 0;
  stack[top++] = seed;
  mask[seed] = 1;
  while (top > 0) {
    const i = stack[--top]!;
    count++;
    const x = i % width;
    const push = (j: number) => {
      if (!mask[j] && allowed(j)) {
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
 * Filtro a finestra quadrata (lato 2r+1), separabile: con `all` = erosione (1 solo se tutta la finestra è 1),
 * altrimenti dilatazione (1 se almeno un pixel della finestra è 1). Fuori dall'immagine conta come `all`
 * (così le aree che toccano il bordo non si restringono).
 */
function windowFilter(src: Uint8Array, width: number, height: number, r: number, all: boolean): Uint8Array {
  const pass = (input: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(input.length);
    const lines = horizontal ? height : width;
    const len = horizontal ? width : height;
    const at = (line: number, k: number) => (horizontal ? line * width + k : k * width + line);
    for (let line = 0; line < lines; line++) {
      // conta dei pixel "sbagliati" (0 per l'erosione, 1 per la dilatazione) nella finestra corrente
      const bad = (k: number) => (k < 0 || k >= len ? 0 : all ? (input[at(line, k)] ? 0 : 1) : input[at(line, k)] ? 1 : 0);
      let count = 0;
      for (let k = -r; k <= r; k++) count += bad(k);
      for (let k = 0; k < len; k++) {
        out[at(line, k)] = all ? (count === 0 ? 1 : 0) : count > 0 ? 1 : 0;
        count += bad(k + r + 1) - bad(k - r);
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

/**
 * Come `floodFill`, ma senza passare per le strettoie più sottili di 2·radius+1 pixel: i contorni a inchiostro e le fughe
 * tra le pietre, dello stesso colore scuro dei vuoti, altrimenti collegherebbero tutta la mappa. Si riempie l'area
 * "erosa" (solo i pixel con tutta la finestra del colore giusto) e poi la si riallarga fino al bordo vero.
 * Se il clic cade in un dettaglio più sottile della finestra, vale il riempimento normale.
 */
export function floodFillThick(raster: Raster, seedX: number, seedY: number, tolerance: number, radius: number): Region {
  const { width, height } = raster;
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (radius <= 0 || sx < 0 || sy < 0 || sx >= width || sy >= height) return floodFill(raster, seedX, seedY, tolerance);
  const matches = colorMatcher(raster, sx, sy, tolerance);
  const candidate = new Uint8Array(width * height);
  for (let i = 0; i < candidate.length; i++) candidate[i] = matches(i) ? 1 : 0;
  const core = windowFilter(candidate, width, height, radius, true);

  // il seme dentro l'area erosa: il pixel cliccato o il più vicino entro la finestra
  let seed = -1;
  let best = Infinity;
  for (let dy = -radius * 2; dy <= radius * 2; dy++) {
    for (let dx = -radius * 2; dx <= radius * 2; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height || !core[y * width + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        seed = y * width + x;
      }
    }
  }
  if (seed < 0) return floodFill(raster, seedX, seedY, tolerance);

  const inner = fillFrom(width, height, seed, (i) => core[i] === 1);
  const grown = windowFilter(inner.mask, width, height, radius, false);
  // riallargata solo sui pixel del colore giusto, e di nuovo un solo pezzo connesso
  return fillFrom(width, height, seed, (i) => grown[i] === 1 && candidate[i] === 1);
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
  /**
   * Le strettoie più sottili di 2·radius+1 pixel non vengono attraversate (contorni a inchiostro, fughe tra le pietre).
   * Se assente: 1 pixel ogni 800 di lato dell'immagine (2 per un'immagine da 1600), 0 per le immagini minuscole.
   */
  radius?: number;
}

export const DEFAULT_WAND: WandOptions = { tolerance: 32, epsilon: 1.5, maxVertices: 200, minPixels: 24, maxFraction: 0.5 };

/** Spessore delle strettoie da non attraversare, in proporzione all'immagine. */
export const wandRadius = (raster: Pick<Raster, "width" | "height">) => Math.round(Math.max(raster.width, raster.height) / 800);

/** Bacchetta magica completa: dal clic al poligono semplificato (pixel dell'immagine). */
export function magicWand(raster: Raster, x: number, y: number, options: Partial<WandOptions> = {}): WandResult {
  const o = { ...DEFAULT_WAND, ...options };
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return { ok: false, reason: "outside" };
  const region = floodFillThick(raster, x, y, o.tolerance, o.radius ?? wandRadius(raster));
  if (region.count < o.minPixels) return { ok: false, reason: "too-small" };
  if (region.count > raster.width * raster.height * o.maxFraction) return { ok: false, reason: "too-large" };
  const polygon = simplifyToLimit(traceContour(region), o.epsilon, o.maxVertices);
  return polygon.length >= 6 ? { ok: true, polygon, pixels: region.count } : { ok: false, reason: "too-small" };
}
