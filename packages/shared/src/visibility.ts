import { feetToPx, type Point } from "./grid";
import type { MapElement, Scene } from "./schemas/scene";

export interface Segment {
  a: Point;
  b: Point;
}

/** Muri e ostacoli bloccano sempre la vista; le porte solo se chiuse; il terreno difficile mai. */
export function elementBlocksSight(el: Pick<MapElement, "type" | "open">): boolean {
  if (el.type === "door") return !el.open;
  return el.type === "wall" || el.type === "obstacle";
}

/** Apre o chiude la porta `id`; la scena resta identica se l'elemento non esiste o non è una porta. */
export function toggleDoor(scene: Scene, id: string): Scene {
  const door = scene.elements.find((el) => el.id === id);
  if (!door || door.type !== "door") return scene;
  return { ...scene, elements: scene.elements.map((el) => (el === door ? { ...el, open: !el.open } : el)) };
}

/** Raggio di calcolo quando la visione non ha limite, in pixel del mondo. */
export const UNLIMITED_VISION_PX = 20_000;

/** Raggio della visione in pixel del mondo (0 ft = senza limite). */
export function visionRadiusPx(vision: { radiusFt: number }, grid: { feetPerCell: number; cellPx: number }): number {
  return vision.radiusFt > 0 ? feetToPx(vision.radiusFt, grid) : UNLIMITED_VISION_PX;
}

/**
 * Segmenti che bloccano la vista, in pixel del mondo: i lati degli elementi rettangolari (muri, porte chiuse, ostacoli),
 * degli oggetti dello sfondo che la bloccano (ruotati attorno al loro angolo in alto a sinistra come sulla mappa)
 * e i poligoni tracciati a mano.
 */
export function sightSegments(scene: Pick<Scene, "elements" | "sightBlockers" | "objects" | "grid">): Segment[] {
  const g = scene.grid;
  const segments: Segment[] = [];
  const addPolygon = (corners: Point[]) => {
    corners.forEach((a, i) => segments.push({ a, b: corners[(i + 1) % corners.length]! }));
  };

  for (const blocker of scene.sightBlockers) {
    const corners: Point[] = [];
    for (let i = 0; i + 1 < blocker.points.length; i += 2) {
      corners.push({ x: g.offsetX + blocker.points[i]! * g.cellPx, y: g.offsetY + blocker.points[i + 1]! * g.cellPx });
    }
    if (corners.length >= 3) addPolygon(corners);
  }

  const addRect = (x: number, y: number, w: number, h: number, rotation: number) => {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const origin = { x: g.offsetX + x * g.cellPx, y: g.offsetY + y * g.cellPx };
    const u = { x: cos * w * g.cellPx, y: sin * w * g.cellPx };
    const v = { x: -sin * h * g.cellPx, y: cos * h * g.cellPx };
    addPolygon([origin, { x: origin.x + u.x, y: origin.y + u.y }, { x: origin.x + u.x + v.x, y: origin.y + u.y + v.y }, { x: origin.x + v.x, y: origin.y + v.y }]);
  };
  for (const el of scene.elements) {
    if (elementBlocksSight(el)) addRect(el.x, el.y, el.w, el.h, el.rotation);
  }
  for (const o of scene.objects) {
    if (o.blocksSight) addRect(o.x, o.y, o.w, o.h, o.rotation);
  }
  return segments;
}

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
  if (t < 0 || u < -1e-9 || u > 1 + 1e-9) return null;
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

/**
 * Poligono visibile da `origin` a 360°, entro `radius`, ostacolato dai segmenti.
 * Si lanciano raggi verso gli estremi di ogni segmento (e poco prima/dopo, per vedere "oltre lo spigolo")
 * e a passo regolare; ogni raggio si ferma sul primo segmento o al raggio massimo.
 * Restituisce [x1, y1, x2, y2, ...] in ordine d'angolo.
 */
export function visibilityPolygon(origin: Point, segments: Segment[], radius: number): number[] {
  const near = segments.filter((s) => distanceToSegment(origin, s) <= radius);
  const angles: number[] = [];
  for (let i = 0; i < ARC_RAYS; i++) angles.push(wrapAngle((i / ARC_RAYS) * 2 * Math.PI));
  for (const s of near) {
    for (const p of [s.a, s.b]) {
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
    for (const s of near) {
      const hit = rayHit(origin, dx, dy, s);
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
