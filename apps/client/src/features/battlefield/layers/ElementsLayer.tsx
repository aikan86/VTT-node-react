import { Group, Layer, Rect, Text, Transformer } from "react-konva";
import { cellToPx, snapPxToCell, type MapElement, type Scene } from "@vtt/shared";
import { snapTo } from "../geometry";
import { useTransformer } from "./useTransformer";

interface Props {
  scene: Scene;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  draft: { x: number; y: number; w: number; h: number; color: string } | null;
  onSelect: (id: string) => void;
  onChange: (element: MapElement) => void;
}

function styleOf(el: MapElement) {
  switch (el.type) {
    case "difficult":
      return { fill: el.color, opacity: 0.35, stroke: el.color, dash: [6, 4], strokeWidth: 2 };
    case "door":
      return { fill: el.color, opacity: 0.95, stroke: "#fbbf24", strokeWidth: 2 };
    default:
      return { fill: el.color, opacity: 0.95, stroke: "#111827", strokeWidth: 1 };
  }
}

export function ElementsLayer({ scene, listening, editable, selectedId, draft, onSelect, onChange }: Props) {
  const g = scene.grid;
  const { transformer, register } = useTransformer(selectedId, editable);

  return (
    <Layer listening={listening} visible={scene.layers.elements.visible}>
      {scene.elements.map((el) => {
        const pos = cellToPx(el, g);
        const w = el.w * g.cellPx;
        const h = el.h * g.cellPx;
        return (
          <Group
            key={el.id}
            ref={register(el.id)}
            x={pos.x}
            y={pos.y}
            rotation={el.rotation}
            draggable={editable}
            onMouseDown={() => onSelect(el.id)}
            onTap={() => onSelect(el.id)}
            onDragEnd={(e) => {
              const cell = snapPxToCell(e.target.position(), g);
              e.target.position(cellToPx(cell, g));
              onChange({ ...el, x: cell.x, y: cell.y });
            }}
            onTransformEnd={(e) => {
              const node = e.target;
              const next = {
                ...el,
                w: Math.max(0.25, snapTo((el.w * node.scaleX()), 0.25)),
                h: Math.max(0.25, snapTo((el.h * node.scaleY()), 0.25)),
                x: snapTo((node.x() - g.offsetX) / g.cellPx, 0.25),
                y: snapTo((node.y() - g.offsetY) / g.cellPx, 0.25),
                rotation: Math.round(node.rotation()),
              };
              node.scale({ x: 1, y: 1 });
              node.position(cellToPx(next, g));
              onChange(next);
            }}
          >
            <Rect width={w} height={h} {...styleOf(el)} />
            {el.label && (
              <Text
                text={el.label}
                width={w}
                height={h}
                align="center"
                verticalAlign="middle"
                fontSize={Math.max(10, Math.min(16, g.cellPx * 0.3))}
                fill="#f9fafb"
                listening={false}
              />
            )}
          </Group>
        );
      })}
      {draft && (
        <Rect
          {...cellToPx(draft, g)}
          width={draft.w * g.cellPx}
          height={draft.h * g.cellPx}
          fill={draft.color}
          opacity={0.5}
          stroke="#e0a526"
          dash={[6, 4]}
          listening={false}
        />
      )}
      <Transformer
        ref={transformer}
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        keepRatio={false}
        ignoreStroke
        boundBoxFunc={(oldBox, box) => (box.width < 5 || box.height < 5 ? oldBox : box)}
      />
    </Layer>
  );
}

