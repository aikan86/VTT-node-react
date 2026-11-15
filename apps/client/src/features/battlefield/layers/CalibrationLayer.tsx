import { Circle, Layer, Line } from "react-konva";
import type { Point } from "@vtt/shared";

const COLOR = "#e0a526";

/** Punti scelti e segmento della calibrazione: dimensioni costanti sullo schermo, qualunque sia lo zoom. */
export function CalibrationLayer({ points, viewScale }: { points: Point[]; viewScale: number }) {
  const [a, b] = points;
  return (
    <Layer listening={false}>
      {a && b && <Line points={[a.x, a.y, b.x, b.y]} stroke={COLOR} strokeWidth={2} strokeScaleEnabled={false} />}
      {points.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={6 / viewScale} fill={COLOR} stroke="#000000" strokeWidth={1} strokeScaleEnabled={false} />
      ))}
    </Layer>
  );
}
