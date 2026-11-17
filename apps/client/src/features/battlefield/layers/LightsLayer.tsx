import { useMemo } from "react";
import { Circle, Group, Layer, Line, Text } from "react-konva";
import { lightAreas, type Light, type Scene } from "@vtt/shared";
import { snapTo } from "../geometry";

interface Props {
  scene: Scene;
  /** Indicatori delle luci (solo master): si selezionano e si trascinano sul livello Elementi. */
  markers?: boolean;
  listening?: boolean;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChange?: (light: Light) => void;
}

/** "#rrggbb" → "rgba(r, g, b, a)" per i gradienti dell'alone. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (!/^#[0-9a-f]{6}/i.test(hex) || Number.isNaN(n)) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Alone colorato di ogni luce, fermato da muri e ostacoli come la vista: più intenso in luce piena, sfuma in penombra.
 * Per il master anche un indicatore al centro, e il cerchio della portata quando la luce è selezionata.
 */
export function LightsLayer({ scene, markers = false, listening = false, editable = false, selectedId = null, onSelect, onChange }: Props) {
  const g = scene.grid;
  const areas = useMemo(
    () => lightAreas(scene),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.lights, scene.elements, scene.sightBlockers, scene.objects, scene.grid],
  );
  const lit = scene.lights.filter((l) => l.brightFt + l.dimFt > 0);
  if (scene.lights.length === 0) return null;

  return (
    <Layer listening={listening}>
      {areas.map((a, i) => {
        const light = lit[i]!;
        const brightStop = a.outerPx > 0 ? Math.min(1, a.brightPx / a.outerPx) : 0;
        return (
          <Line
            key={light.id}
            points={a.outer}
            closed
            listening={false}
            fillRadialGradientStartPoint={a.center}
            fillRadialGradientEndPoint={a.center}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={a.outerPx}
            fillRadialGradientColorStops={[0, withAlpha(light.color, 0.35), brightStop, withAlpha(light.color, 0.22), 1, withAlpha(light.color, 0)]}
          />
        );
      })}
      {markers &&
        scene.lights.map((light) => {
          const selected = light.id === selectedId;
          const r = Math.max(6, g.cellPx * 0.3);
          return (
            <Group
              key={light.id}
              x={g.offsetX + light.x * g.cellPx}
              y={g.offsetY + light.y * g.cellPx}
              draggable={editable}
              onMouseDown={() => onSelect?.(light.id)}
              onTap={() => onSelect?.(light.id)}
              onDragEnd={(e) => {
                const x = snapTo((e.target.x() - g.offsetX) / g.cellPx, 0.5);
                const y = snapTo((e.target.y() - g.offsetY) / g.cellPx, 0.5);
                e.target.position({ x: g.offsetX + x * g.cellPx, y: g.offsetY + y * g.cellPx });
                onChange?.({ ...light, x, y });
              }}
            >
              {selected && (
                <Circle
                  radius={((light.brightFt + light.dimFt) / g.feetPerCell) * g.cellPx}
                  stroke={light.color}
                  dash={[8, 6]}
                  strokeWidth={2}
                  listening={false}
                />
              )}
              <Circle radius={r} fill={light.color} stroke={selected ? "#e0a526" : "#111827"} strokeWidth={selected ? 3 : 1.5} shadowColor={light.color} shadowBlur={12} />
              <Text text="☀" fontSize={r * 1.3} width={r * 2} height={r * 2} offsetX={r} offsetY={r} align="center" verticalAlign="middle" fill="#111827" listening={false} />
            </Group>
          );
        })}
    </Layer>
  );
}
