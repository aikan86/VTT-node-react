import { useMemo } from "react";
import { Group, Layer, Line, Rect, Shape } from "react-konva";
import { exploredRuns, type PartySight, type Scene } from "@vtt/shared";
import type { View } from "../types";

interface Props {
  scene: Scene;
  /** Ciò che il party vede ora (da `usePartySight`). */
  sight: PartySight;
  view: View;
  size: { width: number; height: number };
  /** Opacità del velo al posto di quella della scena (la vista giocatori usa 1: ciò che non vedono è nero). */
  darkness?: number;
}

const VIEW_MARGIN_PX = 50;
/** Quanta parte del velo si toglie sulle zone già esplorate: restano visibili ma in grigio scuro. */
const EXPLORED_REVEAL = 0.4;
/** Quanta parte del velo si toglie in penombra e nella scurovisione (si vede, ma meno che in luce piena). */
const DIM_REVEAL = 0.65;

const holes = (polygons: number[][], opacity: number) =>
  polygons.map((points, i) => <Line key={i} points={points} closed fill="#000000" opacity={opacity} globalCompositeOperation="destination-out" />);

/**
 * Oscura tutto ciò che il party non vede: velo scuro su tutto il campo, schiarito sulle celle già esplorate
 * (memoria della nebbia) e bucato dove il party vede ora. In una scena normale si vede tutta la linea di vista;
 * in una scena buia solo le zone illuminate in linea di vista (luce piena del tutto, penombra in parte) e la
 * scurovisione (in parte). Il DM vede comunque sotto il velo, attenuato.
 */
export function VisionLayer({ scene, sight, view, size, darkness }: Props) {
  const g = scene.grid;
  const runs = useMemo(() => exploredRuns(scene.explored), [scene.explored]);

  if (!scene.vision.enabled || sight.los.length === 0) return null;
  const dark = sight.dark;

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
      {!dark && holes(sight.los, 1)}
      {dark && (
        <>
          {/* le luci si vedono solo dove arriva la linea di vista di un PG */}
          <Group
            clipFunc={(ctx) => {
              ctx.beginPath();
              for (const poly of sight.los) {
                ctx.moveTo(poly[0]!, poly[1]!);
                for (let i = 2; i + 1 < poly.length; i += 2) ctx.lineTo(poly[i]!, poly[i + 1]!);
                ctx.closePath();
              }
            }}
          >
            {holes(dark.lit, DIM_REVEAL)}
            {holes(dark.bright, 1)}
          </Group>
          {holes(dark.darkvision, DIM_REVEAL)}
        </>
      )}
    </Layer>
  );
}
