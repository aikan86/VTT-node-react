import { Image as KImage, Layer, Shape, Transformer } from "react-konva";
import type { Background, Scene } from "@vtt/shared";
import { useImage } from "../hooks";
import { backgroundFromNode, gridLines } from "../geometry";
import type { View } from "../types";
import { useTransformer } from "./useTransformer";

export const BACKGROUND_ID = "background";
const MIN_SIZE_PX = 20;

interface Props {
  scene: Scene;
  listening: boolean;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (background: Background) => void;
}

/** Immagine della mappa: trascinabile, ridimensionabile e ruotabile (attorno al centro) quando il livello è attivo. */
export function BackgroundLayer({ scene, listening, editable, selected, onSelect, onChange }: Props) {
  const bg = scene.background;
  const image = useImage(bg?.imageUrl);
  const { transformer, register } = useTransformer(selected ? BACKGROUND_ID : null, editable);

  const commit = (node: { x(): number; y(): number; scaleX(): number; scaleY(): number; rotation(): number; scale(s: { x: number; y: number }): void }) => {
    if (!bg) return;
    const next = backgroundFromNode(bg, { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() });
    node.scale({ x: 1, y: 1 });
    onChange(next);
  };

  return (
    <Layer listening={listening} visible={scene.layers.background.visible}>
      {image && bg && (
        <KImage
          ref={register(BACKGROUND_ID)}
          image={image}
          x={bg.x + bg.widthPx / 2}
          y={bg.y + bg.heightPx / 2}
          width={bg.widthPx}
          height={bg.heightPx}
          offsetX={bg.widthPx / 2}
          offsetY={bg.heightPx / 2}
          rotation={bg.rotation}
          draggable={editable}
          onMouseDown={onSelect}
          onTap={onSelect}
          onDragEnd={(e) => commit(e.target)}
          onTransformEnd={(e) => commit(e.target)}
        />
      )}
      <Transformer
        ref={transformer}
        rotateEnabled
        keepRatio
        rotationSnaps={[0, 90, 180, 270]}
        rotationSnapTolerance={6}
        anchorSize={10}
        borderStroke="#e0a526"
        anchorStroke="#e0a526"
        boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < MIN_SIZE_PX || Math.abs(newBox.height) < MIN_SIZE_PX ? oldBox : newBox)}
      />
    </Layer>
  );
}

/** Griglia senza bordi: si disegnano solo le linee nell'area visibile (ricalcolate a ogni pan/zoom). */
export function GridLayer({ scene, view, size }: { scene: Scene; view: View; size: { width: number; height: number } }) {
  const g = scene.grid;
  const lines = gridLines(g, view, size);
  return (
    <Layer listening={false} visible={g.visible}>
      {lines && (
        <Shape
          stroke={g.color}
          opacity={g.opacity}
          strokeWidth={1}
          strokeScaleEnabled={false}
          sceneFunc={(ctx, shape) => {
            const top = lines.ys[0]!;
            const bottom = lines.ys[lines.ys.length - 1]! + g.cellPx;
            const left = lines.xs[0]!;
            const right = lines.xs[lines.xs.length - 1]! + g.cellPx;
            ctx.beginPath();
            for (const x of lines.xs) {
              ctx.moveTo(x, top);
              ctx.lineTo(x, bottom);
            }
            for (const y of lines.ys) {
              ctx.moveTo(left, y);
              ctx.lineTo(right, y);
            }
            ctx.strokeShape(shape);
          }}
        />
      )}
    </Layer>
  );
}
