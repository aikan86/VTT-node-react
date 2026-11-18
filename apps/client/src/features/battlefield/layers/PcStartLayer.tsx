import { Layer, Rect, Text } from "react-konva";
import type { Grid, Point } from "@vtt/shared";

const COLOR = "#38bdf8";

/** Punto di partenza dei PG (solo per il master): la cella evidenziata con una bandierina. */
export function PcStartLayer({ start, grid }: { start: Point; grid: Grid }) {
  const x = grid.offsetX + start.x * grid.cellPx;
  const y = grid.offsetY + start.y * grid.cellPx;
  return (
    <Layer listening={false}>
      <Rect x={x} y={y} width={grid.cellPx} height={grid.cellPx} fill={COLOR} opacity={0.25} stroke={COLOR} strokeWidth={2} strokeScaleEnabled={false} dash={[6, 4]} />
      <Text x={x} y={y} width={grid.cellPx} height={grid.cellPx} text="🚩" fontSize={grid.cellPx * 0.6} align="center" verticalAlign="middle" />
    </Layer>
  );
}
