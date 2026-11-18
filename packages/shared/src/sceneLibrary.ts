import { z } from "zod";
import type { Point } from "./grid";
import { findFreeCells, type Footprint } from "./placement";
import { IdSchema, RefSchema, SizeSchema } from "./schemas/common";
import { NpcSchema, type Npc } from "./schemas/combat";
import { SceneSchema, type Scene } from "./schemas/scene";
import { elementBlocksSight, pointInPolygon, rectCorners } from "./visibility";

/**
 * Libreria di scene riutilizzabili: il master salva ciò che ha preparato (sfondo, griglia, elementi, oggetti, luci,
 * visione, PNG piazzati) e lo ricarica come nuova scena. Non si salvano la nebbia esplorata, i PG né lo stato
 * "mostrata ai giocatori" (l'handout attivo non fa parte della scena).
 */

const NameSchema = z.string().trim().min(1).max(80);

/** Modello della scena: la scena senza identità, nebbia esplorata e stato di messa in onda. */
export const SceneTemplateSchema = SceneSchema.omit({ id: true, name: true, explored: true, shownToPlayers: true });
export type SceneTemplate = z.infer<typeof SceneTemplateSchema>;

export const SavedSceneSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  scene: SceneTemplateSchema,
  /** Statistiche dei PNG piazzati (i token del modello li richiamano per id). */
  npcs: z.array(NpcSchema).max(500),
});
export type SavedScene = z.infer<typeof SavedSceneSchema>;

/** Voce dell'elenco: quanto basta per mostrarla senza scaricare tutta la scena. */
export interface SavedSceneSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Immagine di sfondo (lo stesso file caricato, nessuna copia); null = scena senza sfondo. */
  thumbnailUrl: string | null;
  npcCount: number;
}

export const SaveSceneRequestSchema = z.object({
  name: NameSchema,
  scene: SceneSchema,
  /** PNG del combattimento: si tengono solo quelli piazzati nella scena. */
  npcs: z.array(NpcSchema).max(2000).default([]),
});
export type SaveSceneRequest = z.infer<typeof SaveSceneRequestSchema>;

export const RenameSceneRequestSchema = z.object({ name: NameSchema });

export const DuplicateSceneRequestSchema = z.object({ name: NameSchema.optional() });

export const LoadSceneRequestSchema = z.object({
  /** PG da portare nella nuova scena (vuoto = nessuno). */
  pcs: z
    .array(z.object({ ref: RefSchema.refine((r) => r.kind === "pc", "Solo PG"), size: SizeSchema }))
    .max(50)
    .default([]),
});
export type LoadSceneRequest = z.infer<typeof LoadSceneRequestSchema>;

export interface LoadedScene {
  scene: Scene;
  /** PNG nuovi (id nuovi) da aggiungere al combattimento: non entrano nell'iniziativa. */
  npcs: Npc[];
}

export function summarizeSaved(saved: SavedScene): SavedSceneSummary {
  return {
    id: saved.id,
    name: saved.name,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    thumbnailUrl: saved.scene.background?.imageUrl ?? null,
    npcCount: saved.npcs.length,
  };
}

/** Salva la scena nella libreria: via la nebbia esplorata, i PG e la messa in onda; i PNG piazzati con le loro statistiche. */
export function snapshotScene(scene: Scene, npcs: readonly Npc[], name: string, id: string, now = new Date()): SavedScene {
  const byId = new Map(npcs.map((n) => [n.id, n]));
  const tokens = scene.tokens.filter((t) => t.ref.kind === "npc" && byId.has(t.ref.id));
  const placed = [...new Set(tokens.map((t) => t.ref.id))].map((npcId) => byId.get(npcId)!);
  const { id: _id, name: _name, explored: _explored, shownToPlayers: _shown, ...template } = scene;
  const stamp = now.toISOString();
  return { id, name: name.trim(), createdAt: stamp, updatedAt: stamp, scene: { ...template, tokens }, npcs: placed };
}

/** Copia di una scena salvata: stessi file d'immagine (gli indirizzi non cambiano), nome e date nuovi. */
export function duplicateSaved(saved: SavedScene, id: string, name?: string, now = new Date()): SavedScene {
  const stamp = now.toISOString();
  return { ...saved, id, name: (name ?? `${saved.name} (copia)`).trim().slice(0, 80), createdAt: stamp, updatedAt: stamp };
}

/** Cella al centro della mappa: dell'immagine di sfondo, altrimenti degli elementi; (0, 0) in una scena vuota. */
export function sceneCenter(scene: Pick<SceneTemplate, "background" | "grid" | "elements" | "objects">): Point {
  const g = scene.grid;
  const toCell = (px: number, py: number) => ({ x: Math.floor((px - g.offsetX) / g.cellPx), y: Math.floor((py - g.offsetY) / g.cellPx) });
  const bg = scene.background;
  // l'immagine ruota attorno al proprio centro: il centro non cambia
  if (bg) return toCell(bg.x + bg.widthPx / 2, bg.y + bg.heightPx / 2);
  const boxes = [...scene.elements, ...scene.objects];
  if (boxes.length === 0) return { x: 0, y: 0 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: Math.floor((minX + maxX) / 2), y: Math.floor((minY + maxY) / 2) };
}

/** Raggio (celle) attorno al punto di partenza in cui si cercano posti liberi per i PG. */
const PLACE_RADIUS = 25;

/** Celle (come footprint 1×1) occupate da muri, ostacoli, porte chiuse e forme tracciate attorno a `start`. */
function blockedCells(scene: SceneTemplate, start: Point): Footprint[] {
  const g = scene.grid;
  const polygons = [
    ...scene.elements.filter(elementBlocksSight).map((el) => rectCorners(el, g).flatMap((p) => [p.x, p.y])),
    ...scene.sightBlockers.map((b) => b.points.map((v, i) => (i % 2 === 0 ? g.offsetX : g.offsetY) + v * g.cellPx)),
  ];
  if (polygons.length === 0) return [];
  const cells: Footprint[] = [];
  for (let y = start.y - PLACE_RADIUS; y <= start.y + PLACE_RADIUS; y++) {
    for (let x = start.x - PLACE_RADIUS; x <= start.x + PLACE_RADIUS; x++) {
      const center = { x: g.offsetX + (x + 0.5) * g.cellPx, y: g.offsetY + (y + 0.5) * g.cellPx };
      if (polygons.some((poly) => pointInPolygon(center, poly))) cells.push({ x, y, size: 1 });
    }
  }
  return cells;
}

/**
 * Nuova scena dal modello salvato: id nuovi per scena, token e PNG (così si può caricare più volte),
 * nebbia azzerata, non mostrata ai giocatori. I PG indicati vengono piazzati liberi attorno al punto di partenza
 * della scena o, se manca, al centro della mappa, evitando PNG, muri e ostacoli.
 */
export function instantiateScene(saved: SavedScene, pcs: LoadSceneRequest["pcs"], newId: () => string): LoadedScene {
  const template = saved.scene;
  const npcIds = new Map(saved.npcs.map((n) => [n.id, newId()]));
  const npcs = saved.npcs.map((n) => ({ ...n, id: npcIds.get(n.id)! }));
  const npcSize = new Map(saved.npcs.map((n) => [n.id, n.size]));
  const npcTokens = template.tokens
    .filter((t) => t.ref.kind === "npc" && npcIds.has(t.ref.id))
    .map((t) => ({ ...t, id: newId(), ref: { kind: "npc" as const, id: npcIds.get(t.ref.id)! } }));

  const start = template.pcStart ?? sceneCenter(template);
  const occupied: Footprint[] = [
    ...template.tokens.filter((t) => t.ref.kind === "npc").map((t) => ({ x: t.x, y: t.y, size: npcSize.get(t.ref.id) ?? 1 })),
    ...blockedCells(template, start),
  ];
  const spots = findFreeCells(occupied, pcs.map((p) => p.size), start, PLACE_RADIUS);
  const pcTokens = spots.map((spot, i) => ({ id: newId(), ref: pcs[i]!.ref, x: spot.x, y: spot.y }));

  const scene: Scene = {
    ...template,
    id: newId(),
    name: saved.name,
    explored: [],
    shownToPlayers: false,
    tokens: [...npcTokens, ...pcTokens],
  };
  return { scene, npcs };
}
