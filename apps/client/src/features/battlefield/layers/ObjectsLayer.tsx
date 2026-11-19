import { Group, Layer, Transformer } from "react-konva";
import type { MapObject, Scene } from "@vtt/shared";
import { snapTo } from "../geometry";
import { ObjectArt } from "./ObjectArt";
import { useTransformer } from "./useTransformer";

interface Props {
  scene: Scene;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (object: MapObject) => void;
}

/** Oggetti dello sfondo (fontane, case, tende…): sopra l'immagine, sotto la griglia, seguono il livello Sfondo. */
export function ObjectsLayer({ scene, listening, editable, selectedId, onSelect, onChange }: Props) {
  const g = scene.grid;
  const { transformer, register } = useTransformer(selectedId, editable);

  return (
    <Layer listening={listening} visible={scene.layers.background.visible}>
      {scene.objects.map((o) => (
        <Group
          key={o.id}
          ref={register(o.id)}
          x={g.offsetX + o.x * g.cellPx}
          y={g.offsetY + o.y * g.cellPx}
          rotation={o.rotation}
          draggable={editable}
          onMouseDown={() => onSelect(o.id)}
          onTap={() => onSelect(o.id)}
          onDragEnd={(e) => {
            // agganciato a mezza cella (incroci e centri della griglia)
            const x = snapTo((e.target.x() - g.offsetX) / g.cellPx, 0.5);
            const y = snapTo((e.target.y() - g.offsetY) / g.cellPx, 0.5);
            e.target.position({ x: g.offsetX + x * g.cellPx, y: g.offsetY + y * g.cellPx });
            onChange({ ...o, x, y });
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const next = {
              ...o,
              w: Math.max(0.25, snapTo(o.w * node.scaleX(), 0.25)),
              h: Math.max(0.25, snapTo(o.h * node.scaleY(), 0.25)),
              x: snapTo((node.x() - g.offsetX) / g.cellPx, 0.25),
              y: snapTo((node.y() - g.offsetY) / g.cellPx, 0.25),
              rotation: Math.round(node.rotation()),
            };
            node.scale({ x: 1, y: 1 });
            node.position({ x: g.offsetX + next.x * g.cellPx, y: g.offsetY + next.y * g.cellPx });
            onChange(next);
          }}
        >
          <ObjectArt object={o} cellPx={g.cellPx} />
        </Group>
      ))}
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
