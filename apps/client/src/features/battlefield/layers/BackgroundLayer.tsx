import { Image as KImage, Layer, Rect, Shape } from "react-konva";
import type { Scene } from "@vtt/shared";
import { useImage } from "../hooks";
import { worldSize } from "../geometry";

export function BackgroundLayer({ scene }: { scene: Scene }) {
  const image = useImage(scene.background?.imageUrl);
  const { width, height } = worldSize(scene);
  return (
    <Layer listening={false} visible={scene.layers.background.visible}>
      <Rect width={width} height={height} fill="#2a2925" />
      {image && scene.background && (
        <KImage image={image} width={scene.background.widthPx} height={scene.background.heightPx} />
      )}
    </Layer>
  );
}

export function GridLayer({ scene }: { scene: Scene }) {
  const g = scene.grid;
  return (
    <Layer listening={false} visible={g.visible}>
      <Shape
        stroke={g.color}
        opacity={g.opacity}
        strokeWidth={1}
        strokeScaleEnabled={false}
        sceneFunc={(ctx, shape) => {
          const w = g.cols * g.cellPx;
          const h = g.rows * g.cellPx;
          ctx.beginPath();
          for (let i = 0; i <= g.cols; i++) {
            const x = g.offsetX + i * g.cellPx;
            ctx.moveTo(x, g.offsetY);
            ctx.lineTo(x, g.offsetY + h);
          }
          for (let j = 0; j <= g.rows; j++) {
            const y = g.offsetY + j * g.cellPx;
            ctx.moveTo(g.offsetX, y);
            ctx.lineTo(g.offsetX + w, y);
          }
          ctx.strokeShape(shape);
        }}
      />
    </Layer>
  );
}
