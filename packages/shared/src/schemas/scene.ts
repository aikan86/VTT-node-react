import { z } from "zod";
import { ColorSchema, IdSchema, RefSchema, createId } from "./common";

export const LAYER_KEYS = ["background", "elements", "tokens", "effects"] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
  background: "Sfondo",
  elements: "Elementi",
  tokens: "Personaggi",
  effects: "Effetti",
};

const LayerStateSchema = z.object({ visible: z.boolean(), locked: z.boolean() });

/** Griglia senza bordi: copre tutto il campo di battaglia, si può piazzare ovunque (anche a coordinate negative). */
export const GridSchema = z.object({
  cellPx: z.number().min(8).max(400),
  /** Sfasamento delle linee: non più modificabile, mantenuto perché le scene esistenti non si spostino. */
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  /** Obsoleti (la griglia non ha più dimensioni): accettati e ignorati per le scene salvate prima. */
  cols: z.number().int().min(1).optional(),
  rows: z.number().int().min(1).optional(),
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  feetPerCell: z.number().positive().default(5),
});
export type Grid = z.infer<typeof GridSchema>;

export const BackgroundSchema = z.object({
  imageUrl: z.string().min(1),
  /** Dimensioni mostrate sulla mappa (al caricamento: quelle originali dell'immagine). */
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  /** Angolo in alto a sinistra dell'immagine non ruotata, in pixel del mondo. */
  x: z.number().default(0),
  y: z.number().default(0),
  /** Gradi, attorno al centro dell'immagine. */
  rotation: z.number().default(0),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const ELEMENT_TYPES = ["wall", "door", "obstacle", "difficult"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
export const ELEMENT_LABELS: Record<ElementType, string> = {
  wall: "Muro",
  door: "Porta",
  obstacle: "Ostacolo",
  difficult: "Terreno difficile",
};
export const ELEMENT_COLORS: Record<ElementType, string> = {
  wall: "#4b5563",
  door: "#92400e",
  obstacle: "#57534e",
  difficult: "#65a30d",
};

/** Coordinate e dimensioni in celle. */
export const MapElementSchema = z.object({
  id: IdSchema,
  type: z.enum(ELEMENT_TYPES),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number(),
  color: ColorSchema,
  label: z.string().max(80).optional(),
});
export type MapElement = z.infer<typeof MapElementSchema>;

/** Posizione (angolo in alto a sinistra) in celle intere. */
export const TokenSchema = z.object({
  id: IdSchema,
  ref: RefSchema,
  x: z.number().int(),
  y: z.number().int(),
  /** Nascosto ai giocatori: il master lo vede (attenuato), la vista giocatori no. */
  hidden: z.boolean().optional(),
});
export type Token = z.infer<typeof TokenSchema>;

export const EFFECT_SHAPES = ["circle", "square", "cone", "line"] as const;
export type EffectShape = (typeof EFFECT_SHAPES)[number];
export const EFFECT_LABELS: Record<EffectShape, string> = {
  circle: "Sfera / Cerchio",
  square: "Cubo / Quadrato",
  cone: "Cono",
  line: "Linea",
};

/** Origine in celle (frazionaria), dimensioni in piedi, rotazione in gradi. */
export const EffectSchema = z.object({
  id: IdSchema,
  shape: z.enum(EFFECT_SHAPES),
  x: z.number(),
  y: z.number(),
  sizeFt: z.number().positive().max(1000),
  widthFt: z.number().positive().max(1000).optional(),
  rotation: z.number(),
  color: ColorSchema,
  opacity: z.number().min(0).max(1),
});
export type Effect = z.infer<typeof EffectSchema>;

/**
 * Annotazioni a mano sul livello Effetti. Coordinate in celle (frazionarie), così seguono la griglia;
 * spessori e dimensioni del testo in pixel del mondo.
 */
const CellCoord = z.number().min(-100_000).max(100_000);

export const TextDrawingSchema = z.object({
  id: IdSchema,
  kind: z.literal("text"),
  x: CellCoord,
  y: CellCoord,
  text: z.string().max(500),
  fontSize: z.number().min(4).max(400),
  rotation: z.number(),
  color: ColorSchema,
});

export const LineDrawingSchema = z.object({
  id: IdSchema,
  kind: z.literal("line"),
  /** [x1, y1, x2, y2] */
  points: z.tuple([CellCoord, CellCoord, CellCoord, CellCoord]),
  strokeWidth: z.number().min(1).max(100),
  color: ColorSchema,
});

export const FreehandDrawingSchema = z.object({
  id: IdSchema,
  kind: z.literal("freehand"),
  /** Coppie x, y appiattite: [x1, y1, x2, y2, ...] */
  points: z.array(CellCoord).min(4).max(10_000).refine((p) => p.length % 2 === 0, "Coordinate a coppie"),
  strokeWidth: z.number().min(1).max(100),
  color: ColorSchema,
});

export const DrawingSchema = z.discriminatedUnion("kind", [TextDrawingSchema, LineDrawingSchema, FreehandDrawingSchema]);
export type Drawing = z.infer<typeof DrawingSchema>;
export type TextDrawing = z.infer<typeof TextDrawingSchema>;
export type LineDrawing = z.infer<typeof LineDrawingSchema>;
export type FreehandDrawing = z.infer<typeof FreehandDrawingSchema>;

/**
 * Poligono tracciato a mano che blocca la vista (un edificio, un gruppo di alberi, una roccia…).
 * Coordinate in celle (frazionarie) a coppie [x1, y1, x2, y2, ...]: seguono la griglia. Almeno 3 vertici.
 */
export const SightBlockerSchema = z.object({
  id: IdSchema,
  points: z
    .array(CellCoord)
    .min(6)
    .max(400)
    .refine((p) => p.length % 2 === 0, "Coordinate a coppie"),
});
export type SightBlocker = z.infer<typeof SightBlockerSchema>;

/** Visione del party: i personaggi sulla mappa vedono a 360°, fino a `radiusFt` (0 = senza limite), ostacolati da muri e ostacoli. */
export const VisionSchema = z.object({
  enabled: z.boolean(),
  radiusFt: z.number().min(0).max(10_000),
  /** Opacità dell'oscurità sulle zone non visibili (il DM le vede comunque, attenuate). */
  darkness: z.number().min(0).max(1),
});
export type Vision = z.infer<typeof VisionSchema>;

export const DEFAULT_VISION: Vision = { enabled: false, radiusFt: 60, darkness: 0.7 };

export const SceneSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(80),
  background: BackgroundSchema.nullable(),
  grid: GridSchema,
  layers: z.object({
    background: LayerStateSchema,
    elements: LayerStateSchema,
    tokens: LayerStateSchema,
    effects: LayerStateSchema,
  }),
  elements: z.array(MapElementSchema),
  tokens: z.array(TokenSchema),
  effects: z.array(EffectSchema),
  /** Assente nelle scene salvate prima dei disegni. */
  drawings: z.array(DrawingSchema).default([]),
  /** Assenti nelle scene salvate prima della visione del party. */
  sightBlockers: z.array(SightBlockerSchema).default([]),
  vision: VisionSchema.default(DEFAULT_VISION),
  /** La vista giocatori mostra questa scena (al massimo una alla volta). */
  shownToPlayers: z.boolean().default(false),
});
export type Scene = z.infer<typeof SceneSchema>;

export function newScene(name = "Nuova scena"): Scene {
  const layer = { visible: true, locked: false };
  return {
    id: createId(),
    name,
    background: null,
    grid: {
      cellPx: 50,
      offsetX: 0,
      offsetY: 0,
      color: "#000000",
      opacity: 0.35,
      visible: true,
      feetPerCell: 5,
    },
    layers: { background: { ...layer }, elements: { ...layer }, tokens: { ...layer }, effects: { ...layer } },
    elements: [],
    tokens: [],
    effects: [],
    drawings: [],
    sightBlockers: [],
    vision: { ...DEFAULT_VISION },
    shownToPlayers: false,
  };
}

