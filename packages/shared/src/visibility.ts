import { cellToPx, feetToPx, type Point } from "./grid";
import type { Scene } from "./schemas/scene";

export interface Segment {
  a: Point;
  b: Point;
}

/** Elementi rettangolari che bloccano la vista (le porte solo se chiuse). */
const SIGHT_BLOCKING_ELEMENTS: ReadonlySet<string> = new Set(["wall", "door", "obstacle"]);

const blocksSight = (el: Scene["elements"][number]) => SIGHT_BLOCKING_ELEMENTS.has(el.type) && !(el.type === "door" && el.open);

/** Raggio di calcolo quando la visione non ha limite, in pixel del mondo. */
export const UNLIMITED_VISION_PX = 20_000;

/** Raggio della visione in pixel del mondo (0 ft = senza limite). */
export function visionRadiusPx(vision: { radiusFt: number }, grid: { feetPerCell: number; cellPx: number }): number {
  return vision.radiusFt > 0 ? feetToPx(vision.radiusFt, grid) : UNLIMITED_VISION_PX;
}

/**
 * Forme che bloccano la vista, come vertici in pixel del mondo: gli elementi rettangolari (muri, porte chiuse,
 * ostacoli, ruotati attorno al loro angolo in alto a sinistra come sulla mappa) e i poligoni tracciati a mano.
 */
export function sightPolygons(scene: Pick<Scene, "elements" | "sightBlockers" | "grid">): Point[][] {
  const g = scene.grid;
  const polygons: Point[][] = [];

  for (const blocker of scene.sightBlockers) {
    const corners: Point[] = [];
    for (let i = 0; i + 1 < blocker.points.length; i += 2) {
      corners.push(cellToPx({ x: blocker.points[i]!, y: blocker.points[i + 1]! }, g));
    }
    if (corners.length >= 3) polygons.push(corners);
  }

  for (const el of scene.elements) {
    if (!blocksSight(el)) continue;
    const rad = (el.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const origin = cellToPx(el, g);
    const u = { x: cos * el.w * g.cellPx, y: sin * el.w * g.cellPx };
    const v = { x: -sin * el.h * g.cellPx, y: cos * el.h * g.cellPx };
    polygons.push([origin, { x: origin.x + u.x, y: origin.y + u.y }, { x: origin.x + u.x + v.x, y: origin.y + u.y + v.y }, { x: origin.x + v.x, y: origin.y + v.y }]);
  }
  return polygons;
}

/**
 * Lati delle forme come segmenti. Con `viewer`, le forme che lo contengono vengono saltate: un personaggio
 * fermo su una porta o dentro un ostacolo vede intorno a sé invece di restare chiuso nel rettangolo.
 */
export function polygonSegments(polygons: Point[][], viewer?: Point): Segment[] {
  const segments: Segment[] = [];
  for (const corners of polygons) {
    if (viewer && pointInPolygon(viewer, corners.flatMap((c) => [c.x, c.y]))) continue;
    corners.forEach((a, i) => segments.push({ a, b: corners[(i + 1) % corners.length]! }));
  }
  return segments;
}

/** Segmenti che bloccano la vista (vedi `sightPolygons` e `polygonSegments`). */
export function sightSegments(scene: Pick<Scene, "elements" | "sightBlockers" | "grid">, viewer?: Point): Segment[] {
  return polygonSegments(sightPolygons(scene), viewer);
}

/** Sotto questa distanza (pixel del mondo) un incontro col segmento si considera alla partenza del raggio e si ignora. */
const MIN_HIT_DISTANCE = 1e-6;

/** Distanza lungo il raggio (origine `o`, direzione `dx, dy`) a cui incontra il segmento; null se non lo incontra. */
function rayHit(o: Point, dx: number, dy: number, s: Segment): number | null {
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return null; // parallelo
  const ax = s.a.x - o.x;
  const ay = s.a.y - o.y;
  const t = (ax * sy - ay * sx) / denom;
  const u = (ax * dy - ay * dx) / denom;
  // t ≈ 0: l'origine sta sul segmento (es. un token centrato sul bordo di un muro); non deve accecare il raggio
  if (t <= MIN_HIT_DISTANCE || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

function distanceToSegment(p: Point, s: Segment): number {
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const len2 = sx * sx + sy * sy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - s.a.x) * sx + (p.y - s.a.y) * sy) / len2));
  return Math.hypot(p.x - (s.a.x + t * sx), p.y - (s.a.y + t * sy));
}

const EPSILON_RAD = 1e-4;
/** Raggi uniformi che approssimano l'arco quando nulla blocca la vista (uno ogni grado). */
const ARC_RAYS = 360;

const wrapAngle = (a: number) => {
  let r = a;
  while (r <= -Math.PI) r += 2 * Math.PI;
  while (r > Math.PI) r -= 2 * Math.PI;
  return r;
};

/** Spicchi angolari in cui si indicizzano i segmenti: ogni raggio controlla solo quelli del suo spicchio. */
const ANGLE_BINS = 360;
const BIN_WIDTH = (2 * Math.PI) / ANGLE_BINS;
const binOf = (angle: number) => Math.min(ANGLE_BINS - 1, Math.max(0, Math.floor((angle + Math.PI) / BIN_WIDTH)));

interface IndexedSegment {
  segment: Segment;
  /** Distanza minima dall'origine: nessun raggio può incontrarlo più vicino di così. */
  distance: number;
}

/**
 * Indice angolare dei segmenti visti da `origin`: per ogni spicchio, i segmenti che lo attraversano in ordine
 * di distanza. Un segmento che non contiene l'origine la vede sotto un angolo minore di 180°, quindi
 * occupa solo gli spicchi dell'arco più corto tra i suoi estremi (più uno di margine per lato).
 */
function angularIndex(origin: Point, near: IndexedSegment[]): IndexedSegment[][] {
  const bins: IndexedSegment[][] = Array.from({ length: ANGLE_BINS }, () => []);
  for (const item of near) {
    const { a, b } = item.segment;
    const a1 = Math.atan2(a.y - origin.y, a.x - origin.x);
    const span = wrapAngle(Math.atan2(b.y - origin.y, b.x - origin.x) - a1);
    const from = wrapAngle(span >= 0 ? a1 : a1 + span);
    const first = binOf(from) - 1;
    const count = Math.ceil(Math.abs(span) / BIN_WIDTH) + 3;
    for (let k = 0; k < Math.min(count, ANGLE_BINS); k++) bins[(((first + k) % ANGLE_BINS) + ANGLE_BINS) % ANGLE_BINS]!.push(item);
  }
  return bins;
}

/**
 * Poligono visibile da `origin` a 360°, entro `radius`, ostacolato dai segmenti.
 * Si lanciano raggi verso gli estremi di ogni segmento (e poco prima/dopo, per vedere "oltre lo spigolo")
 * e a passo regolare; ogni raggio si ferma sul primo segmento o al raggio massimo.
 * Per restare veloce con molti ostacoli, ogni raggio controlla solo i segmenti del suo spicchio angolare,
 * dal più vicino, e si ferma appena i successivi non possono essere più vicini del punto già trovato.
 * Restituisce [x1, y1, x2, y2, ...] in ordine d'angolo.
 */
export function visibilityPolygon(origin: Point, segments: Segment[], radius: number): number[] {
  const near: IndexedSegment[] = [];
  for (const segment of segments) {
    const distance = distanceToSegment(origin, segment);
    // sul segmento (distanza ≈ 0) nessun raggio lo incontra a t > 0: si salta
    if (distance <= radius && distance > MIN_HIT_DISTANCE) near.push({ segment, distance });
  }
  near.sort((x, y) => x.distance - y.distance);
  const bins = angularIndex(origin, near);

  const angles: number[] = [];
  for (let i = 0; i < ARC_RAYS; i++) angles.push(wrapAngle((i / ARC_RAYS) * 2 * Math.PI));
  // i vertici condivisi da più segmenti (gli spigoli delle forme) generano raggi una sola volta
  const corners = new Set<string>();
  for (const { segment } of near) {
    for (const p of [segment.a, segment.b]) {
      const key = `${p.x},${p.y}`;
      if (corners.has(key)) continue;
      corners.add(key);
      const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(wrapAngle(angle - EPSILON_RAD), angle, wrapAngle(angle + EPSILON_RAD));
    }
  }
  angles.sort((x, y) => x - y);

  const points: number[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let reach = radius;
    for (const { segment, distance } of bins[binOf(angle)]!) {
      if (distance >= reach) break;
      const hit = rayHit(origin, dx, dy, segment);
      if (hit !== null && hit < reach) reach = hit;
    }
    points.push(origin.x + dx * reach, origin.y + dy * reach);
  }
  return points;
}

/** Il punto cade dentro il poligono [x1, y1, x2, y2, ...]? */
export function pointInPolygon(p: Point, polygon: number[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i]!;
    const yi = polygon[i + 1]!;
    const xj = polygon[j]!;
    const yj = polygon[j + 1]!;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
