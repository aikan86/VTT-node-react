import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import {
  canPlayerMove,
  cellCenter,
  coveredCells,
  DEFAULT_SPEED_FT,
  movementRange,
  playerScene,
  withoutUnseenTokens,
  type Point,
  type Ref,
  type Scene,
  type Token,
} from "@vtt/shared";
import { isTyping } from "./hooks";
import { MovementLayer, type MovementArea } from "./layers/MovementLayer";
import { RulerLayer } from "./layers/RulerLayer";
import styles from "./Battlefield.module.css";
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
import { usePartySight } from "./vision";
import { LightsLayer } from "./layers/LightsLayer";

interface Props {
  scene: Scene;
  resolve: EntityResolver;
  /** Chi ha il turno (evidenziato sul token). */
  currentRef: Ref | null;
  /** Un giocatore ha trascinato un PG su una nuova cella (solo i token per cui `canPlayerMove`). */
  onMoveToken?: (token: Token) => void;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const noop = () => {};

/**
 * Mappa in sola lettura per i giocatori: ciò che il master ha reso visibile, senza token nascosti, senza
 * ostacoli alla vista tracciati e senza barre dei PF. Si adatta allo schermo; rotella per lo zoom,
 * trascinamento per spostarsi, doppio clic per rimettere la mappa a misura.
 */
export function PlayerStage({ scene, resolve, currentRef, onMoveToken }: Props) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  /** Righello (tasto R o pulsante): trascinando si misura invece di spostare la mappa. */
  const [measuring, setMeasuring] = useState(false);
  const [ruler, setRuler] = useState<{ start: Point; end: Point; dragging: boolean } | null>(null);
  /** Raggio di movimento del PG che si sta trascinando. */
  const [moveArea, setMoveArea] = useState<MovementArea | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") setMeasuring((m) => !m);
      else if (e.key === "Escape") setMeasuring(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!measuring) setRuler(null);
  }, [measuring]);
  const shown = useMemo(() => playerScene(scene), [scene]);
  const sight = usePartySight(shown, resolve);
  // nelle zone ricordate (grigie) o al buio i nemici non compaiono: solo dove il party vede ora
  const inSight = useMemo(() => withoutUnseenTokens(shown, sight, (ref) => resolve(ref)?.size), [shown, sight, resolve]);
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

  const canMove = (token: Token) => onMoveToken !== undefined && !measuring && canPlayerMove(shown, token);

  const startDrag = (token: Token) => {
    const sizeOf = resolve(token.ref)?.size ?? 1;
    const speedFt = token.speedFt ?? DEFAULT_SPEED_FT;
    if (speedFt <= 0) return;
    // stesso calcolo del master: velocità e, più chiaro, scatto
    const range = movementRange(shown, token, sizeOf, speedFt * 2);
    setMoveArea({ cells: coveredCells(range, sizeOf), speedFt });
  };

  /** Punto del righello: centro della casella, oppure il punto esatto con Shift. */
  const rulerPoint = (stage: Konva.Stage, free: boolean): Point | null => {
    const world = stage.getRelativePointerPosition();
    return world && (free ? world : cellCenter(world, scene.grid));
  };

  const zoomAt = (pointer: Point, factor: number) =>
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const world = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale };
      return { scale, x: pointer.x - world.x * scale, y: pointer.y - world.y * scale };
    });

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, cursor: measuring ? "crosshair" : undefined }}>
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={!measuring}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onPointerDown={(e) => {
            const stage = e.target.getStage();
            if (!measuring || !stage || e.evt.button > 0) return;
            const p = rulerPoint(stage, e.evt.shiftKey);
            if (p) setRuler({ start: p, end: p, dragging: true });
          }}
          onPointerMove={(e) => {
            const stage = e.target.getStage();
            if (!ruler?.dragging || !stage) return;
            const p = rulerPoint(stage, e.evt.shiftKey);
            if (p) setRuler({ ...ruler, end: p });
          }}
          onPointerUp={() => {
            if (ruler?.dragging) setRuler({ ...ruler, dragging: false });
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
          <LightsLayer scene={shown} />
          {moveArea && <MovementLayer grid={shown.grid} area={moveArea} />}
          <TokensLayer
            scene={inSight}
            resolve={resolve}
            listening={!measuring && onMoveToken !== undefined}
            editable={false}
            selectedId={null}
            currentRef={currentRef}
            onSelect={noop}
            movable={canMove}
            onDragStart={startDrag}
            onMove={(token) => {
              setMoveArea(null);
              onMoveToken?.(token);
            }}
            hideHp
          />
          <VisionLayer scene={shown} sight={sight} view={view} size={size} darkness={1} />
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
          {ruler && <RulerLayer start={ruler.start} end={ruler.end} grid={shown.grid} viewScale={view.scale} />}
        </Stage>
      )}
      <div className={styles.playerTools}>
        {measuring && <span className={styles.playerHint}>Trascina per misurare · Shift: punto libero · R o Esc: chiudi</span>}
        <button className={measuring ? "active" : ""} aria-pressed={measuring} onClick={() => setMeasuring((m) => !m)} title="Misura distanze (R)">
          📏 Righello
        </button>
      </div>
    </div>
  );
}
