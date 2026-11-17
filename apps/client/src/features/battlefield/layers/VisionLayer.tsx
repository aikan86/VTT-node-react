import { useMemo } from "react";
import { Layer, Line, Rect, Shape } from "react-konva";
import { exploredRuns, type Scene } from "@vtt/shared";
import type { View } from "../types";

interface Props {
  scene: Scene;
  /** Poligoni di ciò che il party vede ora (da `usePartyVision`). */
  polygons: number[][];
  view: View;
  size: { width: number; height: number };
  /** Opacità del velo al posto di quella della scena (la vista giocatori usa 1: ciò che non vedono è nero). */
  darkness?: number;
}

const VIEW_MARGIN_PX = 50;
/** Quanta parte del velo si toglie sulle zone già esplorate: restano visibili ma in grigio scuro. */
const EXPLORED_REVEAL = 0.4;

/**
 * Oscura tutto ciò che il party non vede: velo scuro su tutto il campo, schiarito sulle celle già esplorate
 * (memoria della nebbia) e bucato del tutto dal poligono di visibilità di ogni personaggio (PG) sulla mappa.
 * Il DM vede comunque sotto il velo, attenuato.
 */
export function VisionLayer({ scene, polygons, view, size, darkness }: Props) {
  const g = scene.grid;
  const runs = useMemo(() => exploredRuns(scene.explored), [scene.explored]);

  if (!scene.vision.enabled || polygons.length === 0) return null;

  return (
    <Layer listening={false}>
      <Rect
        x={-view.x / view.scale - VIEW_MARGIN_PX}
        y={-view.y / view.scale - VIEW_MARGIN_PX}
        width={size.width / view.scale + VIEW_MARGIN_PX * 2}
        height={size.height / view.scale + VIEW_MARGIN_PX * 2}
        fill="#000000"
        opacity={darkness ?? scene.vision.darkness}
      />
      {runs.length > 0 && (
        // un'unica forma: le celle adiacenti non lasciano righe chiare tra loro
        <Shape
          sceneFunc={(ctx, shape) => {
            ctx.beginPath();
            for (const r of runs) ctx.rect(g.offsetX + r.x * g.cellPx, g.offsetY + r.y * g.cellPx, r.w * g.cellPx, g.cellPx);
            ctx.fillShape(shape);
          }}
          fill="#000000"
          opacity={EXPLORED_REVEAL}
          globalCompositeOperation="destination-out"
        />
      )}
      {polygons.map((points, i) => (
        <Line key={i} points={points} closed fill="#000000" globalCompositeOperation="destination-out" />
      ))}
    </Layer>
  );
}
