import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";
import { playerScene, withoutUnseenTokens, type Point, type Ref, type Scene } from "@vtt/shared";
import type { EntityResolver } from "../../store/entities";
import { clamp, contentBounds } from "./geometry";
import { useElementSize } from "./hooks";
import { BackgroundLayer, GridLayer } from "./layers/BackgroundLayer";
import { EffectsLayer } from "./layers/EffectsLayer";
import { ElementsLayer } from "./layers/ElementsLayer";
import { ObjectsLayer } from "./layers/ObjectsLayer";
import { TokensLayer } from "./layers/TokensLayer";
import { VisionLayer } from "./layers/VisionLayer";
import type { View } from "./types";
import { usePartyVision } from "./vision";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  /** Chi ha il turno (evidenziato sul token). */
  currentRef: Ref | null;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const noop = () => {};

/**
 * Mappa in sola lettura per i giocatori: ciò che il master ha reso visibile, senza token nascosti, senza
 * ostacoli alla vista tracciati e senza barre dei PF. Si adatta allo schermo; rotella per lo zoom,
 * trascinamento per spostarsi, doppio clic per rimettere la mappa a misura.
 */
export function PlayerStage({ scene, resolve, currentRef }: Props) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const shown = useMemo(() => playerScene(scene), [scene]);
  const visionPolygons = usePartyVision(shown, resolve);
  // nelle zone ricordate (grigie) i nemici non compaiono: solo dove il party vede ora
  const inSight = useMemo(() => withoutUnseenTokens(shown, visionPolygons, (ref) => resolve(ref)?.size), [shown, visionPolygons, resolve]);
  const bg = scene.background;
  const latest = useRef({ shown, resolve, size });
  latest.current = { shown, resolve, size };

  const fit = () => {
    const { shown: s, resolve: r, size: sz } = latest.current;
    if (!sz.width || !sz.height) return;
    const b = contentBounds(s, (ref) => r(ref)?.size ?? 1);
    const width = Math.max(1, b.maxX - b.minX);
    const height = Math.max(1, b.maxY - b.minY);
    const scale = clamp(Math.min(sz.width / width, sz.height / height) * 0.98, MIN_SCALE, MAX_SCALE);
    setView({ scale, x: (sz.width - width * scale) / 2 - b.minX * scale, y: (sz.height - height * scale) / 2 - b.minY * scale });
  };

  // Si adatta quando cambia scena, immagine (o la sua posizione/scala) o dimensione dello schermo
  const fitKey = `${scene.id}|${bg?.imageUrl ?? ""}|${bg?.x},${bg?.y},${bg?.widthPx},${bg?.heightPx},${bg?.rotation}`;
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.width, size.height]);

  const zoomAt = (pointer: Point, factor: number) =>
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const world = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale };
      return { scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale };
    });

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const pointer = e.target.getStage()?.getPointerPosition();
            if (pointer) zoomAt(pointer, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
          }}
          onDblClick={fit}
        >
          <BackgroundLayer scene={shown} listening={false} editable={false} selected={false} onSelect={noop} onChange={noop} />
          <ObjectsLayer scene={shown} listening={false} editable={false} selectedId={null} onSelect={noop} onChange={noop} />
          <GridLayer scene={shown} view={view} size={size} />
          <ElementsLayer scene={shown} listening={false} editable={false} selectedId={null} draft={null} onSelect={noop} onChange={noop} />
          <TokensLayer scene={inSight} resolve={resolve} listening={false} editable={false} selectedId={null} currentRef={currentRef} onSelect={noop} onMove={noop} hideHp />
          <VisionLayer scene={shown} polygons={visionPolygons} view={view} size={size} darkness={1} />
          <EffectsLayer
            scene={shown}
            listening={false}
            editable={false}
            selectedId={null}
            erasing={false}
            viewScale={view.scale}
            draft={null}
            onSelect={noop}
            onChange={noop}
            onDrawingChange={noop}
            onErase={noop}
          />
        </Stage>
      )}
    </div>
  );
}
