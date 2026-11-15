import { Fragment, useSyncExternalStore } from "react";
import { Circle, Layer, Line } from "react-konva";
import type { Point, Scene, SightBlocker } from "@vtt/shared";
import { cellPointsToPx, roundCell, translatePoints } from "../geometry";
import { CLOSE_TRACE_SCREEN_PX, SIGHT_COLOR } from "../types";

interface Props {
  scene: Scene;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  /** Tracciamento di una nuova forma: vertici già cliccati e posizione del mouse, in pixel del mondo. */
  tracing: boolean;
  trace: Point[];
  hover: HoverStore;
  viewScale: number;
  onSelect: (id: string) => void;
  onChange: (blocker: SightBlocker) => void;
}

const FILL = "rgba(168, 85, 247, 0.25)";
const TRACE_COLOR = "#e0a526";

/**
 * Posizione del mouse durante il tracciamento, fuori dallo stato React di BattleStage: a ogni movimento
 * si ridisegna solo l'anteprima della forma, non tutto lo Stage.
 */
export interface HoverStore {
  get: () => Point | null;
  set: (p: Point | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createHoverStore(): HoverStore {
  let current: Point | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (p) => {
      current = p;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Ostacoli alla vista tracciati a mano: spostabili, con maniglie sui vertici quando sono selezionati. */
export function SightBlockersLayer({ scene, listening, editable, selectedId, tracing, trace, hover, viewScale, onSelect, onChange }: Props) {
  const g = scene.grid;

  return (
    <Layer listening={listening} visible={scene.layers.elements.visible}>
      {scene.sightBlockers.map((b) => {
        const selected = b.id === selectedId;
        const px = cellPointsToPx(b.points, g);
        return (
          <Fragment key={b.id}>
            <Line
              points={px}
              closed
              fill={FILL}
              stroke={selected ? "#ffffff" : SIGHT_COLOR}
              strokeWidth={2}
              strokeScaleEnabled={false}
              draggable={editable}
              onMouseDown={() => onSelect(b.id)}
              onTap={() => onSelect(b.id)}
              onDragEnd={(e) => {
                const dx = e.target.x() / g.cellPx;
                const dy = e.target.y() / g.cellPx;
                e.target.position({ x: 0, y: 0 });
                onChange({ ...b, points: translatePoints(b.points, dx, dy).map(roundCell) });
              }}
            />
            {selected &&
              editable &&
              Array.from({ length: px.length / 2 }, (_, i) => (
                <Circle
                  key={i}
                  x={px[i * 2]!}
                  y={px[i * 2 + 1]!}
                  radius={6 / viewScale}
                  fill="#ffffff"
                  stroke={SIGHT_COLOR}
                  strokeWidth={2}
                  strokeScaleEnabled={false}
                  draggable
                  onMouseDown={() => onSelect(b.id)}
                  onDragEnd={(e) => {
                    const points = [...b.points];
                    points[i * 2] = roundCell((e.target.x() - g.offsetX) / g.cellPx);
                    points[i * 2 + 1] = roundCell((e.target.y() - g.offsetY) / g.cellPx);
                    onChange({ ...b, points });
                  }}
                />
              ))}
          </Fragment>
        );
      })}

      {tracing && trace.length > 0 && <TracePreview trace={trace} hover={hover} viewScale={viewScale} />}
    </Layer>
  );
}

/** Forma in tracciamento: vertici cliccati e lato verso il mouse; il primo vertice si ingrandisce quando un click chiuderebbe la forma. */
function TracePreview({ trace, hover: hoverStore, viewScale }: { trace: Point[]; hover: HoverStore; viewScale: number }) {
  const hover = useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
  const first = trace[0];
  const nearFirst = trace.length >= 3 && hover !== null && first !== undefined && Math.hypot(hover.x - first.x, hover.y - first.y) <= CLOSE_TRACE_SCREEN_PX / viewScale;
  return (
    <>
      <Line
        points={[...trace.flatMap((p) => [p.x, p.y]), ...(hover ? [hover.x, hover.y] : [])]}
        stroke={TRACE_COLOR}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[6, 4]}
        listening={false}
      />
      {trace.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={(i === 0 && nearFirst ? 9 : 5) / viewScale}
          fill={i === 0 ? TRACE_COLOR : "#ffffff"}
          stroke="#000000"
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </>
  );
}
