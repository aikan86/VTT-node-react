import { useMemo } from "react";
import { Layer, Line, Rect } from "react-konva";
import { cellToPx, sightSegments, visibilityPolygon, visionRadiusPx, type Point, type Scene } from "@vtt/shared";
import type { EntityResolver } from "../../../store/entities";
import type { View } from "../types";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  view: View;
  size: { width: number; height: number };
  /** Opacità del velo al posto di quella della scena (la vista giocatori usa 1: ciò che non vedono è nero). */
  darkness?: number;
}

const VIEW_MARGIN_PX = 50;

/**
 * Oscura tutto ciò che il party non vede: velo scuro su tutto il campo, bucato dal poligono di visibilità
 * di ogni personaggio (PG) sulla mappa. Il DM vede comunque sotto il velo, attenuato.
 */
export function VisionLayer({ scene, resolve, view, size, darkness }: Props) {
  const g = scene.grid;
  const vision = scene.vision;

  const origins: Point[] = [];
  if (vision.enabled) {
    for (const token of scene.tokens) {
      if (token.ref.kind !== "pc") continue;
      const entity = resolve(token.ref);
      if (!entity) continue;
      const pos = cellToPx(token, g);
      const half = (entity.size * g.cellPx) / 2;
      origins.push({ x: pos.x + half, y: pos.y + half });
    }
  }
  const originsKey = origins.map((o) => `${o.x},${o.y}`).join("|");

  const segments = useMemo(
    () => sightSegments(scene),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.elements, scene.sightBlockers, g.cellPx, g.offsetX, g.offsetY],
  );
  const radius = visionRadiusPx(vision, g);
  const polygons = useMemo(
    () => origins.map((o) => visibilityPolygon(o, segments, radius)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originsKey, segments, radius],
  );

  if (!vision.enabled || origins.length === 0) return null;

  return (
    <Layer listening={false}>
      <Rect
        x={-view.x / view.scale - VIEW_MARGIN_PX}
        y={-view.y / view.scale - VIEW_MARGIN_PX}
        width={size.width / view.scale + VIEW_MARGIN_PX * 2}
        height={size.height / view.scale + VIEW_MARGIN_PX * 2}
        fill="#000000"
        opacity={darkness ?? vision.darkness}
      />
      {polygons.map((points, i) => (
        <Line key={i} points={points} closed fill="#000000" globalCompositeOperation="destination-out" />
      ))}
    </Layer>
  );
}
