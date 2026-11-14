import { Circle, Group, Layer, Line, Rect, Text } from "react-konva";
import { cellToPx, sameRef, snapPxToCell, type Ref, type Scene, type Token } from "@vtt/shared";
import type { EntityResolver } from "../../../store/entities";
import { clamp } from "../geometry";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  currentRef: Ref | null;
  onSelect: (id: string) => void;
  onMove: (token: Token) => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function hpFill(ratio: number) {
  return ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#eab308" : "#ef4444";
}

export function TokensLayer({ scene, resolve, listening, editable, selectedId, currentRef, onSelect, onMove }: Props) {
  const g = scene.grid;

  return (
    <Layer listening={listening} visible={scene.layers.tokens.visible}>
      {scene.tokens.map((token) => {
        const entity = resolve(token.ref);
        if (!entity) return null; // token orfano (PNG rimosso): non viene disegnato
        const pos = cellToPx(token, g);
        const s = entity.size * g.cellPx;
        const r = s / 2;
        const ratio = entity.hp.max > 0 ? clamp(entity.hp.current / entity.hp.max, 0, 1) : 0;
        const isCurrent = currentRef !== null && sameRef(currentRef, token.ref);
        const isSelected = selectedId === token.id;
        const down = entity.hp.current <= 0;
        const barW = s - 8;

        return (
          <Group
            key={token.id}
            x={pos.x}
            y={pos.y}
            draggable={editable}
            onMouseDown={() => onSelect(token.id)}
            onTap={() => onSelect(token.id)}
            onDragStart={(e) => e.target.moveToTop()}
            onDragEnd={(e) => {
              const next = snapPxToCell(e.target.position(), g);
              e.target.position(cellToPx(next, g));
              onMove({ ...token, ...next });
            }}
          >
            {isCurrent && (
              <Circle x={r} y={r} radius={r + 2} stroke="#e0a526" strokeWidth={5} shadowColor="#e0a526" shadowBlur={14} />
            )}
            <Circle
              x={r}
              y={r}
              radius={r - 3}
              fill={entity.color}
              opacity={down ? 0.45 : 1}
              stroke={isSelected ? "#ffffff" : "#0b0d12"}
              strokeWidth={isSelected ? 3 : 2}
              shadowColor="#000"
              shadowBlur={6}
              shadowOpacity={0.5}
            />
            <Text
              text={initials(entity.name)}
              width={s}
              height={s}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(10, s * 0.34)}
              fontStyle="bold"
              fill="#ffffff"
              listening={false}
            />
            {down && (
              <Line points={[s * 0.25, s * 0.25, s * 0.75, s * 0.75, s * 0.5, s * 0.5, s * 0.75, s * 0.25, s * 0.25, s * 0.75]} stroke="#ef4444" strokeWidth={4} listening={false} />
            )}
            <Rect x={4} y={s - 9} width={barW} height={5} fill="#111827" cornerRadius={2} listening={false} />
            <Rect x={4} y={s - 9} width={barW * ratio} height={5} fill={hpFill(ratio)} cornerRadius={2} listening={false} />
            <Text
              text={entity.name}
              x={-g.cellPx * 0.2}
              y={s + 2}
              width={s + g.cellPx * 0.4}
              align="center"
              wrap="none"
              ellipsis
              fontSize={12}
              fill="#ffffff"
              shadowColor="#000"
              shadowBlur={3}
              shadowOpacity={1}
              listening={false}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
