import { visibleCells, type PxBounds } from "./fog";
import { cellToPx, feetToPx, type Point } from "./grid";
import type { Ref } from "./schemas/common";
import type { Grid, Light, Scene } from "./schemas/scene";
import { pointInPolygon, polygonSegments, sightPolygons, visibilityPolygon, visionRadiusPx, type Segment } from "./visibility";

/** Personaggio giocante che guarda: centro del token in pixel del mondo e scurovisione in piedi. */
export interface Viewer {
  origin: Point;
  darkvisionFt: number;
}

/** Centri dei PG sulla mappa (con la loro scurovisione): da qui parte la visione del party. */
export function partyViewers(scene: Pick<Scene, "tokens" | "grid">, sizeOf: (ref: Ref) => number | undefined): Viewer[] {
  const g = scene.grid;
  const viewers: Viewer[] = [];
  for (const token of scene.tokens) {
    if (token.ref.kind !== "pc") continue;
    const size = sizeOf(token.ref);
    if (size === undefined) continue;
    const half = (size * g.cellPx) / 2;
    viewers.push({ origin: { x: g.offsetX + token.x * g.cellPx + half, y: g.offsetY + token.y * g.cellPx + half }, darkvisionFt: token.darkvisionFt ?? 0 });
  }
  return viewers;
}

/** Area raggiunta da una luce, fermata dai segmenti: luce piena (null se 0 ft) e area totale con la penombra. */
export interface LightArea {
  center: Point;
  /** Raggi in pixel del mondo. */
  brightPx: number;
  outerPx: number;
  bright: number[] | null;
  outer: number[];
}

export function lightArea(light: Light, segments: Segment[], g: Pick<Grid, "cellPx" | "offsetX" | "offsetY" | "feetPerCell">): LightArea {
  const center = cellToPx(light, g);
  const brightPx = feetToPx(light.brightFt, g);
  const outerPx = feetToPx(light.brightFt + light.dimFt, g);
  return {
    center,
    brightPx,
    outerPx,
    bright: brightPx > 0 ? visibilityPolygon(center, segments, brightPx) : null,
    outer: outerPx > 0 ? visibilityPolygon(center, segments, outerPx) : [],
  };
}

/**
 * Le aree di tutte le luci della scena che illuminano qualcosa. Come per i PG, una luce dentro una forma che blocca
 * la vista (una torcia su una porta, un braciere in un ostacolo) ignora quella forma invece di restarci chiusa.
 */
export function lightAreas(scene: Pick<Scene, "lights" | "grid" | "elements" | "sightBlockers" | "objects">, polygons = sightPolygons(scene)): LightArea[] {
  const g = scene.grid;
  return scene.lights
    .filter((l) => l.brightFt + l.dimFt > 0)
    .map((l) => lightArea(l, polygonSegments(polygons, cellToPx(l, g)), g));
}

/**
 * Ciò che il party vede ora, come poligoni in pixel del mondo.
 * - `los`: linea di vista di ogni PG (muri e ostacoli la fermano), entro il raggio della visione.
 * - `dark`: solo in una scena buia. Lì si vede un punto se è nella scurovisione di un PG, oppure se è sia
 *   in linea di vista sia illuminato (`lit`: luce piena o penombra; `bright`: solo luce piena).
 */
export interface PartySight {
  los: number[][];
  dark: null | { bright: number[][]; lit: number[][]; darkvision: number[][] };
}

export const NO_SIGHT: PartySight = { los: [], dark: null };

/** La scena è buia per il party? Serve anche la visione attiva. */
export const isDarkScene = (scene: Pick<Scene, "dark" | "vision">) => scene.vision.enabled && scene.dark;

export function partySight(scene: Scene, sizeOf: (ref: Ref) => number | undefined): PartySight {
  if (!scene.vision.enabled) return NO_SIGHT;
  const viewers = partyViewers(scene, sizeOf);
  if (viewers.length === 0) return NO_SIGHT;
  const polygons = sightPolygons(scene);
  // chi sta su una porta o dentro un ostacolo non resta chiuso nella forma: ogni PG ha i suoi segmenti
  const segments = viewers.map((v) => polygonSegments(polygons, v.origin));
  const radius = visionRadiusPx(scene.vision, scene.grid);
  const los = viewers.map((v, i) => visibilityPolygon(v.origin, segments[i]!, radius));
  if (!scene.dark) return { los, dark: null };

  const areas = lightAreas(scene, polygons);
  const darkvision = viewers.flatMap((v, i) =>
    v.darkvisionFt > 0 ? [visibilityPolygon(v.origin, segments[i]!, Math.min(radius, feetToPx(v.darkvisionFt, scene.grid)))] : [],
  );
  return {
    los,
    dark: {
      bright: areas.flatMap((a) => (a.bright ? [a.bright] : [])),
      lit: areas.map((a) => a.outer),
      darkvision,
    },
  };
}

const inAny = (p: Point, polygons: number[][]) => polygons.some((poly) => pointInPolygon(p, poly));

/** Il party vede ora il punto (pixel del mondo)? */
export function pointSeen(p: Point, sight: PartySight): boolean {
  if (!sight.dark) return inAny(p, sight.los);
  return inAny(p, sight.dark.darkvision) || (inAny(p, sight.los) && inAny(p, sight.dark.lit));
}

/** Celle (chiavi "x,y") che il party vede ora: sono quelle che la nebbia ricorda. */
export function seenCells(sight: PartySight, g: Pick<Grid, "cellPx" | "offsetX" | "offsetY">, limit: PxBounds): string[] {
  if (!sight.dark) return visibleCells(sight.los, g, limit);
  const inSight = new Set(visibleCells(sight.los, g, limit));
  const cells = new Set(visibleCells(sight.dark.darkvision, g, limit));
  for (const key of visibleCells(sight.dark.lit, g, limit)) if (inSight.has(key)) cells.add(key);
  return [...cells];
}

/**
 * Nella vista giocatori, con la visione attiva, i token che non sono personaggi giocanti compaiono solo se il party
 * li vede ora: nelle zone ricordate (in grigio) o al buio non devono svelare dove sono i nemici.
 */
export function withoutUnseenTokens(scene: Scene, sight: PartySight, sizeOf: (ref: Ref) => number | undefined): Scene {
  if (sight.los.length === 0) return scene;
  const g = scene.grid;
  const tokens = scene.tokens.filter((t) => {
    if (t.ref.kind === "pc") return true;
    const half = ((sizeOf(t.ref) ?? 1) * g.cellPx) / 2;
    return pointSeen({ x: g.offsetX + t.x * g.cellPx + half, y: g.offsetY + t.y * g.cellPx + half }, sight);
  });
  return tokens.length === scene.tokens.length ? scene : { ...scene, tokens };
}
