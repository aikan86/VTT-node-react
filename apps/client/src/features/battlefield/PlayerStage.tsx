import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import {
  canPlayerMove,
  cellCenter,
  cellToPx,
  type PartyMover,
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
  /** Spostamento confermato da un giocatore (solo i token per cui `canPlayerMove`). */
  onMoveToken?: (token: Token) => void;
  /** Chi può muovere ora (fuori combattimento tutti i PG, in combattimento solo quello di turno). */
  mover?: PartyMover;
}

/** Spostamento trascinato ma non ancora confermato: la scena (e quindi la vista) non cambia finché non si conferma. */
interface PendingMove {
  token: Token;
  to: Point;
  /** Piedi spesi per arrivarci; null se non è raggiungibile nemmeno con uno scatto. */
  costFt: number | null;
  speedFt: number;
}

/** Destinazione proposta: sagoma tratteggiata del token e percorso dal punto di partenza (sopra la nebbia, ma non rivela nulla). */
function PendingMoveLayer({ pending, size, color, grid, viewScale }: { pending: PendingMove; size: number; color: string; grid: Scene["grid"]; viewScale: number }) {
  const k = 1 / viewScale;
  const r = (size * grid.cellPx) / 2;
  const from = cellToPx(pending.token, grid);
  const to = cellToPx(pending.to, grid);
  return (
    <Layer listening={false}>
      <Line points={[from.x + r, from.y + r, to.x + r, to.y + r]} stroke="#facc15" strokeWidth={2.5 * k} dash={[8 * k, 6 * k]} lineCap="round" />
      <Circle x={to.x + r} y={to.y + r} radius={r - 3} fill={color} opacity={0.45} stroke="#facc15" strokeWidth={3 * k} dash={[6 * k, 4 * k]} />
    </Layer>
  );
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 6;
const noop = () => {};

/**
 * Mappa in sola lettura per i giocatori: ciò che il master ha reso visibile, senza token nascosti, senza
 * ostacoli alla vista tracciati e senza barre dei PF. Si adatta allo schermo; rotella per lo zoom,
 * trascinamento per spostarsi, doppio clic per rimettere la mappa a misura.
 */
export function PlayerStage({ scene, resolve, currentRef, onMoveToken, mover = "any" }: Props) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  /** Righello (tasto R o pulsante): trascinando si misura invece di spostare la mappa. */
  const [measuring, setMeasuring] = useState(false);
  const [ruler, setRuler] = useState<{ start: Point; end: Point; dragging: boolean } | null>(null);
  /** Raggio di movimento del PG che si sta trascinando. */
  const [moveArea, setMoveArea] = useState<MovementArea | null>(null);
  /** Posizioni raggiungibili (con scatto) del PG trascinato, per dire quanto costa la destinazione. */
  const reach = useRef<Map<string, number>>(new Map());
  const [pending, setPending] = useState<PendingMove | null>(null);

  const cancelMove = () => {
    setPending(null);
    setMoveArea(null);
  };
  const confirmMove = () => {
    if (pending) onMoveToken?.({ ...pending.token, ...pending.to });
    cancelMove();
  };
  const keys = useRef({ cancelMove, confirmMove, pending });
  keys.current = { cancelMove, confirmMove, pending };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const { pending: p, cancelMove: cancel, confirmMove: confirm } = keys.current;
      if (p && e.key === "Escape") cancel();
      else if (p && e.key === "Enter") {
        e.preventDefault();
        confirm();
      } else if (e.key === "r" || e.key === "R") setMeasuring((m) => !m);
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

  const canMove = (token: Token) => onMoveToken !== undefined && !measuring && canPlayerMove(shown, token, mover);

  // cambio di turno, permesso tolto o token sparito: lo spostamento in sospeso decade
  const pendingToken = pending && shown.tokens.find((t) => t.id === pending.token.id);
  const pendingValid = !!pendingToken && pendingToken.x === pending!.token.x && pendingToken.y === pending!.token.y && canMove(pendingToken);
  useEffect(() => {
    if (pending && !pendingValid) cancelMove();
  }, [pending, pendingValid]);

  const startDrag = (token: Token) => {
    setPending(null);
    const sizeOf = resolve(token.ref)?.size ?? 1;
    const speedFt = token.speedFt ?? DEFAULT_SPEED_FT;
    // stesso calcolo del master: velocità e, più chiaro, scatto
    const range = movementRange(shown, token, sizeOf, speedFt * 2);
    reach.current = new Map(range.map((r) => [`${r.x},${r.y}`, r.costFt]));
    setMoveArea(speedFt > 0 ? { cells: coveredCells(range, sizeOf), speedFt } : null);
  };

  const pendingEntity = pending ? resolve(pending.token.ref) : undefined;

  /** Rilascio: il token torna al suo posto e si chiede conferma (niente da confermare se non si è mosso). */
  const proposeMove = (moved: Token) => {
    const original = shown.tokens.find((t) => t.id === moved.id);
    if (!original || (original.x === moved.x && original.y === moved.y)) {
      cancelMove();
      return;
    }
    const to = { x: moved.x, y: moved.y };
    setPending({ token: original, to, costFt: reach.current.get(`${to.x},${to.y}`) ?? null, speedFt: original.speedFt ?? DEFAULT_SPEED_FT });
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
            onMove={proposeMove}
            snapBack
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
          {pending && pendingEntity && (
            <PendingMoveLayer pending={pending} size={pendingEntity.size} color={pendingEntity.color} grid={shown.grid} viewScale={view.scale} />
          )}
        </Stage>
      )}
      {pending && pendingEntity && (
        <div className={styles.confirmMove} role="dialog" aria-label="Conferma lo spostamento">
          <span>
            Spostare <strong>{pendingEntity.name}</strong> qui?{" "}
            <span className="muted">
              {pending.costFt === null
                ? "Oltre la portata, anche con uno scatto."
                : pending.costFt <= pending.speedFt
                  ? `${pending.costFt} ft su ${pending.speedFt}.`
                  : `${pending.costFt} ft: serve uno scatto.`}
            </span>
          </span>
          <button className="primary" onClick={confirmMove}>
            Conferma (Invio)
          </button>
          <button onClick={cancelMove}>Annulla (Esc)</button>
        </div>
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
