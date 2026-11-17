import { Layer, Shape } from "react-konva";
import { parseCellKey, type Grid } from "@vtt/shared";

export interface MovementArea {
  /** Caselle coperte dal token muovendosi, con i piedi spesi (chiave "x,y"). */
  cells: Map<string, number>;
  speedFt: number;
}

interface Props {
  grid: Pick<Grid, "cellPx" | "offsetX" | "offsetY">;
  area: MovementArea;
}

const MOVE_FILL = "rgba(56, 189, 248, 0.32)";
const DASH_FILL = "rgba(56, 189, 248, 0.12)";

/** Raggio di movimento del token selezionato: caselle raggiungibili con la sua velocità e, più chiare, con un movimento doppio. */
export function MovementLayer({ grid: g, area }: Props) {
  return (
    <Layer listening={false}>
      <Shape
        sceneFunc={(ctx) => {
          const c = ctx._context;
          for (const [fill, within] of [
            [DASH_FILL, (cost: number) => cost > area.speedFt],
            [MOVE_FILL, (cost: number) => cost <= area.speedFt],
          ] as const) {
            c.fillStyle = fill;
            c.beginPath();
            for (const [key, cost] of area.cells) {
              if (!within(cost)) continue;
              const { x, y } = parseCellKey(key);
              c.rect(g.offsetX + x * g.cellPx + 1, g.offsetY + y * g.cellPx + 1, g.cellPx - 2, g.cellPx - 2);
            }
            c.fill();
          }
        }}
      />
    </Layer>
  );
}
