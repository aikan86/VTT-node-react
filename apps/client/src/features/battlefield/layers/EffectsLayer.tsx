import { Circle, Layer, Line, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { feetToPx, type Effect, type Scene } from "@vtt/shared";
import { snapTo } from "../geometry";
import { useTransformer } from "./useTransformer";

interface Props {
  scene: Scene;
  listening: boolean;
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (effect: Effect) => void;
}

export function EffectsLayer({ scene, listening, editable, selectedId, onSelect, onChange }: Props) {
  const g = scene.grid;
  const selected = scene.effects.find((e) => e.id === selectedId);
  const { transformer, register } = useTransformer(selectedId, editable && selected?.shape !== "circle");

  return (
    <Layer listening={listening} visible={scene.layers.effects.visible}>
      {scene.effects.map((effect) => {
        const size = feetToPx(effect.sizeFt, g);
        const common = {
          ref: register(effect.id),
          x: g.offsetX + effect.x * g.cellPx,
          y: g.offsetY + effect.y * g.cellPx,
          rotation: effect.rotation,
          fill: effect.color,
          opacity: effect.opacity,
          stroke: selectedId === effect.id ? "#ffffff" : effect.color,
          strokeWidth: 2,
          strokeScaleEnabled: false,
          draggable: editable,
          onMouseDown: () => onSelect(effect.id),
          onTap: () => onSelect(effect.id),
          onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
            // origine agganciata a mezza cella (centri e incroci della griglia)
            const x = snapTo((e.target.x() - g.offsetX) / g.cellPx, 0.5);
            const y = snapTo((e.target.y() - g.offsetY) / g.cellPx, 0.5);
            e.target.position({ x: g.offsetX + x * g.cellPx, y: g.offsetY + y * g.cellPx });
            onChange({ ...effect, x, y });
          },
          onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
            // il Transformer ruota attorno al centro del riquadro: riportiamo il perno sull'origine dell'effetto
            e.target.position({ x: g.offsetX + effect.x * g.cellPx, y: g.offsetY + effect.y * g.cellPx });
            onChange({ ...effect, rotation: Math.round(e.target.rotation()) });
          },
        };
        switch (effect.shape) {
          case "circle":
            return <Circle key={effect.id} {...common} radius={size} />;
          case "square":
            return <Rect key={effect.id} {...common} width={size} height={size} offsetX={size / 2} offsetY={size / 2} />;
          case "cone":
            // D&D 5e: la larghezza del cono in ogni punto è pari alla distanza dall'origine
            return <Line key={effect.id} {...common} points={[0, 0, size, -size / 2, size, size / 2]} closed />;
          case "line": {
            const width = feetToPx(effect.widthFt ?? 5, g);
            return <Rect key={effect.id} {...common} width={size} height={width} offsetY={width / 2} />;
          }
        }
      })}
      <Transformer ref={transformer} resizeEnabled={false} rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} rotationSnapTolerance={8} />
    </Layer>
  );
}
