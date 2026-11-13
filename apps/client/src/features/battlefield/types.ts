import type { EffectShape, ElementType, LayerKey, Ref } from "@vtt/shared";

export interface Selection {
  layer: LayerKey;
  id: string;
}

export type ElementTool = "select" | ElementType;

export interface EffectTool {
  placing: boolean;
  shape: EffectShape;
  sizeFt: number;
  widthFt: number;
  color: string;
}

export interface View {
  x: number;
  y: number;
  scale: number;
}

/** Token in attesa di essere piazzati con un click sulla mappa. */
export type PendingPlacement = Ref[] | null;
