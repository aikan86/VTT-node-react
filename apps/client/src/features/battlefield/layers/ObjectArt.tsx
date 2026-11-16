import type Konva from "konva";
import { Ellipse, Image as KImage, Line, Rect, Shape, Text } from "react-konva";
import type { MapObject } from "@vtt/shared";
import { useImage } from "../hooks";
import { shade } from "./shade";

const OUTLINE = "#1f2024";

function ImageArt({ url, width, height }: { url: string; width: number; height: number }) {
  const image = useImage(url);
  return image ? <KImage image={image} width={width} height={height} /> : <Rect width={width} height={height} fill="#2a2925" stroke="#6b7280" dash={[6, 4]} />;
}

/** Linee tracciate con un solo tracciato (mattoni, tegole, venature): molto più leggero di una Line per ognuna. */
function Strokes({ draw, stroke, opacity = 1, width = 1 }: { draw: (path: { moveTo: (x: number, y: number) => void; lineTo: (x: number, y: number) => void }) => void; stroke: string; opacity?: number; width?: number }) {
  return (
    <Shape
      listening={false}
      stroke={stroke}
      strokeWidth={width}
      opacity={opacity}
      sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
        ctx.beginPath();
        draw({ moveTo: (x, y) => ctx.moveTo(x, y), lineTo: (x, y) => ctx.lineTo(x, y) });
        ctx.strokeShape(shape);
      }}
    />
  );
}

/**
 * Un oggetto visto dall'alto, disegnato nel suo riquadro (0,0)–(larghezza, altezza) in pixel.
 * Quasi tutto è proporzionale al riquadro, quindi l'oggetto si può ridimensionare liberamente.
 */
export function ObjectArt({ object, cellPx }: { object: MapObject; cellPx: number }) {
  const W = object.w * cellPx;
  const H = object.h * cellPx;
  const c = object.color;
  const dark = shade(c, -0.5);
  const m = Math.min(W, H);

  const art = (() => {
    switch (object.kind) {
      case "image":
        return object.imageUrl ? <ImageArt url={object.imageUrl} width={W} height={H} /> : null;

      case "fountain":
        return (
          <>
            <Ellipse x={W / 2} y={H / 2} radiusX={W / 2} radiusY={H / 2} fill="#8d9096" stroke="#4b4e55" strokeWidth={2} />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.86} radiusY={(H / 2) * 0.86} fill="#a9adb4" />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.74} radiusY={(H / 2) * 0.74} fill={c} />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.52} radiusY={(H / 2) * 0.52} fill={shade(c, 0.25)} opacity={0.6} />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.3} radiusY={(H / 2) * 0.3} fill="#9a9ea6" stroke="#4b4e55" strokeWidth={2} />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.13} radiusY={(H / 2) * 0.13} fill="#d4d7dc" />
          </>
        );

      case "house": {
        const horizontal = W >= H;
        const step = Math.max(6, cellPx / 4);
        const chimney = m * 0.12;
        return (
          <>
            <Rect x={0} y={0} width={horizontal ? W : W / 2} height={horizontal ? H / 2 : H} fill={shade(c, 0.12)} />
            <Rect x={horizontal ? 0 : W / 2} y={horizontal ? H / 2 : 0} width={horizontal ? W : W / 2} height={horizontal ? H / 2 : H} fill={shade(c, -0.14)} />
            <Strokes
              stroke={dark}
              opacity={0.4}
              draw={(p) => {
                const length = horizontal ? H : W;
                for (let d = step; d < length; d += step) {
                  if (Math.abs(d - length / 2) < step / 2) continue;
                  if (horizontal) {
                    p.moveTo(0, d);
                    p.lineTo(W, d);
                  } else {
                    p.moveTo(d, 0);
                    p.lineTo(d, H);
                  }
                }
              }}
            />
            <Line points={horizontal ? [0, H / 2, W, H / 2] : [W / 2, 0, W / 2, H]} stroke={shade(c, -0.55)} strokeWidth={3} />
            <Rect x={W * 0.74} y={H * 0.16} width={chimney} height={chimney} fill="#4b4e55" stroke={OUTLINE} strokeWidth={1} />
            <Rect width={W} height={H} stroke={shade(c, -0.6)} strokeWidth={3} cornerRadius={2} />
          </>
        );
      }

      case "tent":
        return (
          <>
            <Line points={[0, 0, W, 0, W / 2, H / 2]} closed fill={shade(c, 0.18)} />
            <Line points={[W, 0, W, H, W / 2, H / 2]} closed fill={shade(c, -0.08)} />
            <Line points={[0, H, W, H, W / 2, H / 2]} closed fill={shade(c, -0.22)} />
            <Line points={[0, 0, 0, H, W / 2, H / 2]} closed fill={shade(c, 0.04)} />
            <Line points={[0, 0, W / 2, H / 2, W, 0, W, H, W / 2, H / 2, 0, H]} stroke={dark} strokeWidth={1.5} />
            <Rect width={W} height={H} stroke={dark} strokeWidth={2} />
            <Ellipse x={W / 2} y={H / 2} radiusX={m * 0.04} radiusY={m * 0.04} fill={dark} />
          </>
        );

      case "wall": {
        const rows = Math.max(1, Math.round(H / (cellPx * 0.5)));
        const rowH = H / rows;
        const brickW = cellPx * 0.75;
        return (
          <>
            <Rect width={W} height={H} fill={c} stroke={OUTLINE} strokeWidth={2} />
            <Strokes
              stroke={dark}
              opacity={0.55}
              draw={(p) => {
                if (W / brickW > 2000 || rows > 2000) return;
                for (let r = 0; r < rows; r++) {
                  const y0 = r * rowH;
                  if (r > 0) {
                    p.moveTo(0, y0);
                    p.lineTo(W, y0);
                  }
                  for (let x = (r % 2 ? brickW / 2 : brickW); x < W; x += brickW) {
                    p.moveTo(x, y0);
                    p.lineTo(x, y0 + rowH);
                  }
                }
              }}
            />
          </>
        );
      }

      case "tree": {
        const blobs: [number, number, number][] = [
          [0.34, 0.34, 0.27],
          [0.66, 0.4, 0.24],
          [0.5, 0.68, 0.29],
          [0.28, 0.66, 0.18],
        ];
        return (
          <>
            <Ellipse x={W / 2} y={H / 2} radiusX={W / 2} radiusY={H / 2} fill={c} stroke={shade(c, -0.6)} strokeWidth={2} />
            {blobs.map(([bx, by, r], i) => (
              <Ellipse key={i} x={W * bx} y={H * by} radiusX={W * r} radiusY={H * r} fill={shade(c, 0.16)} opacity={0.75} />
            ))}
            <Ellipse x={W * 0.58} y={H * 0.3} radiusX={W * 0.09} radiusY={H * 0.09} fill={shade(c, -0.3)} opacity={0.6} />
            <Ellipse x={W * 0.4} y={H * 0.55} radiusX={W * 0.07} radiusY={H * 0.07} fill={shade(c, -0.3)} opacity={0.6} />
          </>
        );
      }

      case "rock": {
        const outline: [number, number][] = [[0.15, 0.3], [0.35, 0.08], [0.7, 0.1], [0.92, 0.35], [0.88, 0.7], [0.6, 0.93], [0.25, 0.88], [0.08, 0.62]];
        const inner = outline.map(([px, py]) => [0.5 + (px - 0.5) * 0.6 - 0.04, 0.5 + (py - 0.5) * 0.6 - 0.05] as const);
        return (
          <>
            <Line points={outline.flatMap(([px, py]) => [px * W, py * H])} closed fill={c} stroke={dark} strokeWidth={2} lineJoin="round" />
            <Line points={inner.flatMap(([px, py]) => [px * W, py * H])} closed fill={shade(c, 0.22)} opacity={0.8} lineJoin="round" />
          </>
        );
      }

      case "well":
        return (
          <>
            <Ellipse x={W / 2} y={H / 2} radiusX={W / 2} radiusY={H / 2} fill={c} stroke={dark} strokeWidth={2} />
            <Ellipse x={W / 2} y={H / 2} radiusX={(W / 2) * 0.66} radiusY={(H / 2) * 0.66} fill="#1f2937" stroke={dark} strokeWidth={2} />
            <Line points={[W * 0.1, H / 2, W * 0.9, H / 2]} stroke="#7c5a3a" strokeWidth={Math.max(3, m * 0.1)} lineCap="round" />
            <Ellipse x={W * 0.62} y={H / 2} radiusX={m * 0.07} radiusY={m * 0.07} fill="#a0702f" stroke={OUTLINE} strokeWidth={1} />
          </>
        );

      case "table":
        return (
          <>
            <Rect width={W} height={H} fill={c} stroke={OUTLINE} strokeWidth={2} cornerRadius={Math.min(6, m * 0.1)} />
            <Strokes
              stroke={shade(c, -0.3)}
              opacity={0.55}
              draw={(p) => {
                for (const f of [0.25, 0.5, 0.75]) {
                  p.moveTo(W * 0.04, H * f);
                  p.lineTo(W * 0.96, H * f);
                }
              }}
            />
          </>
        );

      case "crate":
        return (
          <>
            <Rect width={W} height={H} fill={c} stroke={OUTLINE} strokeWidth={2} />
            <Rect x={W * 0.12} y={H * 0.12} width={W * 0.76} height={H * 0.76} stroke={shade(c, -0.4)} strokeWidth={2} />
            <Line points={[W * 0.12, H * 0.12, W * 0.88, H * 0.88]} stroke={shade(c, -0.4)} strokeWidth={2} />
            <Line points={[W * 0.88, H * 0.12, W * 0.12, H * 0.88]} stroke={shade(c, -0.4)} strokeWidth={2} />
          </>
        );

      case "campfire": {
        const ring = m * 0.4;
        return (
          <>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <Ellipse key={i} x={W / 2 + Math.cos(a) * ring} y={H / 2 + Math.sin(a) * ring} radiusX={m * 0.11} radiusY={m * 0.09} fill="#7c7f86" stroke={OUTLINE} strokeWidth={1} />;
            })}
            <Ellipse x={W / 2} y={H / 2} radiusX={m * 0.32} radiusY={m * 0.32} fill="#2b2118" />
            <Ellipse x={W / 2} y={H / 2} radiusX={m * 0.24} radiusY={m * 0.24} fill={c} opacity={0.9} />
            <Ellipse x={W / 2} y={H / 2} radiusX={m * 0.13} radiusY={m * 0.13} fill="#fde047" />
          </>
        );
      }
    }
  })();

  return (
    <>
      {art}
      {object.label && (
        <Text text={object.label} width={W} height={H} align="center" verticalAlign="middle" fontSize={Math.max(10, Math.min(16, cellPx * 0.3))} fill="#f9fafb" shadowColor="#000" shadowBlur={3} shadowOpacity={1} listening={false} />
      )}
    </>
  );
}
