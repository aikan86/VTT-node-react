import type { EffectShape, ElementType, LayerKey, ObjectKind, Ref } from "@vtt/shared";

export interface Selection {
  layer: LayerKey;
  id: string;
}

/** "light" piazza una luce con un click; "sight" traccia un ostacolo alla vista; gli altri disegnano elementi. */
export type ElementTool = "select" | "sight" | "light" | ElementType;

/** Gli strumenti che disegnano un rettangolo trascinando. */
export const isRectTool = (tool: ElementTool): tool is ElementType => tool !== "select" && tool !== "sight" && tool !== "light";

/** Colore degli ostacoli alla vista tracciati a mano. */
export const SIGHT_COLOR = "#a855f7";
/** Distanza (px sullo schermo) dal primo punto entro cui un clic chiude la forma. */
export const CLOSE_TRACE_SCREEN_PX = 10;

export interface EffectTool {
  placing: boolean;
  shape: EffectShape;
  sizeFt: number;
  widthFt: number;
  color: string;
}

/** Strumenti di disegno del livello Effetti: la gomma elimina per intero i disegni che tocca. */
export type DrawMode = "text" | "line" | "freehand" | "eraser";

export interface DrawTool {
  mode: DrawMode | null;
  color: string;
  /** Pixel del mondo. */
  strokeWidth: number;
  fontSize: number;
}

/** Tratto in corso di disegno, in pixel del mondo. */
export interface SketchDraft {
  kind: "line" | "freehand";
  points: number[];
}

export interface View {
  x: number;
  y: number;
  scale: number;
}

/** Token in attesa di essere piazzati con un click sulla mappa. */
export type PendingPlacement = Ref[] | null;

/** Oggetto dello sfondo in attesa di essere piazzato con un click sulla mappa. */
export interface ObjectTool {
  kind: ObjectKind;
  /** Per le immagini caricate: indirizzo e proporzioni (larghezza / altezza). */
  imageUrl?: string;
  aspect?: number;
}

export const OBJECT_ICONS: Record<ObjectKind, string> = {
  fountain: "⛲",
  house: "🏠",
  tent: "⛺",
  wall: "🧱",
  tree: "🌳",
  rock: "🪨",
  well: "🪣",
  table: "🍽️",
  crate: "📦",
  campfire: "🔥",
  image: "🖼️",
};
