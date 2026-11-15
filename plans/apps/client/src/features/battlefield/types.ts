import type { EffectShape, ElementType, LayerKey, Ref } from "@vtt/shared";

export interface Selection {
  layer: LayerKey;
  id: string;
}

export type ElementTool = "select" | "sight" | ElementType;

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
