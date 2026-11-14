import { useEffect, useRef, useState } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import { ELEMENT_COLORS, pxToCell, type Background, type Effect, type LayerKey, type MapElement, type Point, type Ref, type Scene, type Token } from "@vtt/shared";
import type { EntityResolver } from "../../store/entities";
import { clamp, contentBounds } from "./geometry";
import { useElementSize, useKeyHeld } from "./hooks";
import { BACKGROUND_ID, BackgroundLayer, GridLayer } from "./layers/BackgroundLayer";
import { EffectsLayer } from "./layers/EffectsLayer";
import { ElementsLayer } from "./layers/ElementsLayer";
import { TokensLayer } from "./layers/TokensLayer";
import type { ElementTool, Selection, View } from "./types";
import styles from "./Battlefield.module.css";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  activeLayer: LayerKey;
  selection: Selection | null;
  elementTool: ElementTool;
  /** Click "di posizionamento" attivo (token in attesa, effetto da piazzare). */
  placing: boolean;
  currentRef: Ref | null;
  onSelect: (selection: Selection | null) => void;
  onPlace: (cell: Point, world: Point) => void;
  onDrawElement: (rect: { x: number; y: number; w: number; h: number }) => void;
  onElementChange: (element: MapElement) => void;
  onBackgroundChange: (background: Background) => void;
  onTokenMove: (token: Token) => void;
  onEffectChange: (effect: Effect) => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 6;

export function BattleStage(props: Props) {
  const { scene, activeLayer, selection, elementTool, placing } = props;
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const spaceHeld = useKeyHeld("Space");
  const pan = useRef<{ pointer: Point; view: View; moved: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const [draw, setDraw] = useState<{ start: Point; end: Point } | null>(null);
  const fittedScene = useRef<string | null>(null);

  const fit = () => {
    if (!size.width || !size.height) return;
    const b = contentBounds(scene, (ref) => props.resolve(ref)?.size ?? 1);
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    const scale = clamp(Math.min(size.width / width, size.height / height) * 0.95, MIN_SCALE, MAX_SCALE);
    setView({ scale, x: (size.width - width * scale) / 2 - b.minX * scale, y: (size.height - height * scale) / 2 - b.minY * scale });
  };

  // Adatta la vista alla prima apertura di ogni scena e quando cambia l'immagine di sfondo
  const fitKey = `${scene.id}|${scene.background?.imageUrl ?? ""}`;
  useEffect(() => {
    if (size.width && fittedScene.current !== fitKey) {
      fittedScene.current = fitKey;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.width, size.height]);

  const zoomAt = (pointer: Point, factor: number) => {
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const world = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale };
      return { scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale };
    });
  };

  const locked = scene.layers[activeLayer].locked;
  const drawing = activeLayer === "elements" && elementTool !== "select" && !locked;
  const editable = (layer: LayerKey) => activeLayer === layer && !locked && !spaceHeld && !drawing && !placing;
  const listening = (layer: LayerKey) => activeLayer === layer && !spaceHeld;

  const worldPointer = (stage: Konva.Stage): Point | null => stage.getRelativePointerPosition();

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    if (e.evt.button === 1 || spaceHeld) {
      e.evt.preventDefault();
      pan.current = { pointer, view, moved: false };
      setPanning(true);
      return;
    }
    if (e.evt.button === 0 && drawing) {
      const world = worldPointer(stage);
      if (!world) return;
      const cell = pxToCell(world, scene.grid);
      setDraw({ start: cell, end: cell });
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    if (pan.current) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const start = pan.current;
      start.moved = true;
      setView({ ...start.view, x: start.view.x + pointer.x - start.pointer.x, y: start.view.y + pointer.y - start.pointer.y });
      return;
    }
    if (draw) {
      const world = worldPointer(stage);
      if (world) setDraw({ ...draw, end: pxToCell(world, scene.grid) });
    }
  };

  const draftRect = draw && {
    x: Math.min(draw.start.x, draw.end.x),
    y: Math.min(draw.start.y, draw.end.y),
    w: Math.abs(draw.end.x - draw.start.x) + 1,
    h: Math.abs(draw.end.y - draw.start.y) + 1,
  };

  const handleMouseUp = () => {
    if (pan.current) {
      pan.current = null;
      setPanning(false);
      return;
    }
    if (draftRect) {
      props.onDrawElement(draftRect);
      setDraw(null);
    }
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0 || spaceHeld || drawing) return;
    const stage = e.target.getStage();
    if (!stage) return;
    if (placing) {
      const world = worldPointer(stage);
      if (world) props.onPlace(pxToCell(world, scene.grid), world);
      return;
    }
    if (e.target === stage) props.onSelect(null);
  };

  const selectedIn = (layer: LayerKey) => (selection?.layer === layer ? selection.id : null);
  const select = (layer: LayerKey) => (id: string) => props.onSelect({ layer, id });

  const cursor = panning ? "grabbing" : spaceHeld ? "grab" : drawing || placing ? "crosshair" : "default";
  const elementColor = elementTool === "select" ? "#ffffff" : ELEMENT_COLORS[elementTool];

  return (
    <div ref={containerRef} className={styles.stageWrap} style={{ cursor }} onContextMenu={(e) => e.preventDefault()}>
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onWheel={(e) => {
            e.evt.preventDefault();
            const pointer = e.target.getStage()?.getPointerPosition();
            if (pointer) zoomAt(pointer, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        >
          <BackgroundLayer
            scene={scene}
            listening={listening("background")}
            editable={editable("background")}
            selected={selection?.layer === "background"}
            onSelect={() => props.onSelect({ layer: "background", id: BACKGROUND_ID })}
            onChange={props.onBackgroundChange}
          />
          <GridLayer scene={scene} view={view} size={size} />
          <ElementsLayer
            scene={scene}
            listening={listening("elements")}
            editable={editable("elements")}
            selectedId={selectedIn("elements")}
            draft={draftRect && { ...draftRect, color: elementColor }}
            onSelect={select("elements")}
            onChange={props.onElementChange}
          />
          <TokensLayer
            scene={scene}
            resolve={props.resolve}
            listening={listening("tokens")}
            editable={editable("tokens")}
            selectedId={selectedIn("tokens")}
            currentRef={props.currentRef}
            onSelect={select("tokens")}
            onMove={props.onTokenMove}
          />
          <EffectsLayer
            scene={scene}
            listening={listening("effects")}
            editable={editable("effects")}
            selectedId={selectedIn("effects")}
            onSelect={select("effects")}
            onChange={props.onEffectChange}
          />
        </Stage>
      )}
      <div className={styles.zoom}>
        <button className="icon" onClick={() => zoomAt({ x: size.width / 2, y: size.height / 2 }, 1 / 1.2)} aria-label="Riduci zoom">
          −
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button className="icon" onClick={() => zoomAt({ x: size.width / 2, y: size.height / 2 }, 1.2)} aria-label="Aumenta zoom">
          +
        </button>
        <button onClick={fit}>Adatta</button>
      </div>
      <div className={styles.hint}>Rotella: zoom · Spazio o tasto centrale + trascina: sposta · Canc: elimina · Esc: annulla</div>
    </div>
  );
}
