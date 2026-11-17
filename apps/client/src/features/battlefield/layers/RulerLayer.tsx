import { Circle, Label, Layer, Line, Tag, Text } from "react-konva";
import { formatDistance, formatMove, measure, type Grid, type Point } from "@vtt/shared";

interface Props {
  start: Point;
  end: Point;
  grid: Pick<Grid, "cellPx" | "feetPerCell">;
  viewScale: number;
}

/**
 * Righello: segmento tra i due punti con la distanza di gioco della 3.5e (caselle con le diagonali alternate, in metri,
 * piedi e caselle) e, sotto, quella in linea retta; a dimensione costante sullo schermo.
 */
export function RulerLayer({ start, end, grid, viewScale }: Props) {
  const m = measure(start, end, grid);
  const k = 1 / viewScale;
  const points = [start.x, start.y, end.x, end.y];
  return (
    <Layer listening={false}>
      <Line points={points} stroke="#000000" strokeWidth={5 * k} lineCap="round" opacity={0.6} />
      <Line points={points} stroke="#facc15" strokeWidth={2.5 * k} lineCap="round" dash={[10 * k, 6 * k]} />
      {[start, end].map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={5 * k} fill="#facc15" stroke="#000000" strokeWidth={1.5 * k} />
      ))}
      <Label x={end.x + 12 * k} y={end.y + 12 * k}>
        <Tag fill="#111827" opacity={0.9} cornerRadius={4 * k} stroke="#facc15" strokeWidth={1 * k} />
        <Text
          text={`${formatMove(m.feet, grid.feetPerCell)}\nin linea retta: ${formatDistance({ feet: m.straightFeet, meters: m.straightMeters })}`}
          fontSize={14 * k}
          lineHeight={1.3}
          padding={6 * k}
          fill="#ffffff"
        />
      </Label>
    </Layer>
  );
}
