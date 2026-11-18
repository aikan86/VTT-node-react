import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addCombatant,
  addExplored,
  coveredCells,
  createId,
  DEFAULT_SPEED_FT,
  movementRange,
  ELEMENT_COLORS,
  OBJECT_DEFAULTS,
  resetExplored,
  sameRef,
  DEFAULT_LIGHT,
  seenCells,
  toggleDoor,
  type Drawing,
  type Light,
  type LayerKey,
  type MapObject,
  type Point,
  type Ref,
  type Scene,
} from "@vtt/shared";
import { BattleStage } from "../features/battlefield/BattleStage";
import { isTyping, useUndoShortcuts } from "../features/battlefield/hooks";
import { calibrateBackground, contentBounds, pxPointsToCells, snapTo, withBackgroundGeometry } from "../features/battlefield/geometry";
import { usePartySight } from "../features/battlefield/vision";
import { BackgroundPanel } from "../features/battlefield/panels/BackgroundPanel";
import { CalibrationDialog } from "../features/battlefield/panels/CalibrationDialog";
import { EffectsPanel } from "../features/battlefield/panels/EffectsPanel";
import { ElementsPanel } from "../features/battlefield/panels/ElementsPanel";
import { LayerPanel } from "../features/battlefield/panels/LayerPanel";
import { LibraryPanel } from "../features/battlefield/panels/LibraryPanel";
import { TokensPanel } from "../features/battlefield/panels/TokensPanel";
import { SceneBar } from "../features/battlefield/SceneBar";
import { BACKGROUND_ID } from "../features/battlefield/layers/BackgroundLayer";
import type { MovementArea } from "../features/battlefield/layers/MovementLayer";
import { loadRaster, WAND_ERRORS, wandOnRaster } from "../features/battlefield/wand";
import { isRectTool, type DrawTool, type EffectTool, type ElementTool, type ObjectTool, type PendingPlacement, type Selection, type SketchDraft } from "../features/battlefield/types";
import styles from "../features/battlefield/Battlefield.module.css";
import { AddNpcDialog } from "../features/initiative/AddNpcDialog";
import { useInitiative } from "../features/initiative/useInitiative";
import { createNpcEntries, placeTokens } from "../store/actions";
import { groupEntries } from "../features/initiative/AddNpcDialog";
import { useCombatStore } from "../store/combatStore";
import { sizeOfRef, useEntityResolver } from "../store/entities";
import { editScene, type EditOptions } from "../store/historyStore";
import { useActiveScene, useSceneStore } from "../store/sceneStore";
import { reportError } from "../store/statusStore";

/** Oltre i contenuti della scena la visione senza limite non viene ricordata, salvo questo bordo (in celle). */
const EXPLORE_MARGIN_CELLS = 10;

export function BattlefieldPage() {
  const scene = useActiveScene();
  if (!scene) return null;
  return <Battlefield scene={scene} />;
}

function Battlefield({ scene }: { scene: Scene }) {
  const resolve = useEntityResolver();
  const { current } = useInitiative();
  const [activeLayer, setActiveLayer] = useState<LayerKey>("tokens");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [elementTool, setElementTool] = useState<ElementTool>("select");
  const [effectTool, setEffectTool] = useState<EffectTool>({ placing: false, shape: "circle", sizeFt: 20, widthFt: 5, color: "#f97316" });
  const [drawTool, setDrawTool] = useState<DrawTool>({ mode: null, color: "#ffffff", strokeWidth: 4, fontSize: 28 });
  /** Testo appena piazzato: il pannello mette il focus sul campo per scriverlo. */
  const [newTextId, setNewTextId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPlacement>(null);
  /** Oggetto dello sfondo in attesa di essere piazzato con un click. */
  const [objectTool, setObjectTool] = useState<ObjectTool | null>(null);
  /** I token che si piazzano nascono nascosti ai giocatori. */
  const [placeHidden, setPlaceHidden] = useState(false);
  const [npcDialog, setNpcDialog] = useState(false);
  /** Calibrazione della scala in corso: punti (0-2) scelti sull'immagine, in pixel del mondo. */
  const [calibration, setCalibration] = useState<Point[] | null>(null);
  /** Vertici (pixel del mondo) della forma "ostacolo alla vista" in tracciamento. */
  const [trace, setTrace] = useState<Point[]>([]);
  /** Righello (tasto R). */
  const [measuring, setMeasuring] = useState(false);
  /** Mostra il raggio di movimento del token selezionato. */
  const [showMovement, setShowMovement] = useState(true);
  /** Bacchetta magica: tolleranza di colore ed esito dell'ultimo clic. */
  const [wandTolerance, setWandTolerance] = useState(32);
  const [wandStatus, setWandStatus] = useState<string | null>(null);
  /** Pannello della libreria di scene aperto al posto di quelli dei livelli. */
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** Il prossimo clic sulla mappa sceglie il punto di partenza dei PG. */
  const [pickingStart, setPickingStart] = useState(false);

  const runWand = async (world: Point) => {
    const bg = scene.background;
    if (!bg) return;
    setWandStatus("Analisi dell'immagine…");
    try {
      const result = wandOnRaster(bg, await loadRaster(bg.imageUrl), world, wandTolerance);
      if (!result.ok) {
        setWandStatus(WAND_ERRORS[result.reason]);
        return;
      }
      const blocker = { id: createId(), points: pxPointsToCells(result.polygon, scene.grid) };
      update((s) => ({ ...s, sightBlockers: [...s.sightBlockers, blocker] }));
      setSelection({ layer: "elements", id: blocker.id });
      setWandStatus(`Ostacolo creato: ${result.polygon.length / 2} vertici. Selezionalo per spostarlo o Canc per eliminarlo.`);
    } catch (err) {
      setWandStatus(null);
      reportError(err);
    }
  };

  /** Modifica del master: si può annullare. */
  const update = useCallback((fn: (s: Scene) => Scene, opts?: EditOptions) => editScene(scene.id, fn, opts), [scene.id]);
  /** Cambiamenti di gioco che non si annullano (nebbia esplorata, porte aperte/chiuse, token appena piazzati). */
  const updateUntracked = useCallback((fn: (s: Scene) => Scene) => useSceneStore.getState().update(scene.id, fn), [scene.id]);

  useUndoShortcuts();
  const sight = usePartySight(scene, resolve);
  const latestScene = useRef(scene);
  latestScene.current = scene;

  // Nebbia con memoria: le celle che il party vede ora (al buio: solo quelle illuminate o in scurovisione) restano esplorate
  useEffect(() => {
    const s = latestScene.current;
    if (!s.vision.enabled || sight.los.length === 0) return;
    const b = contentBounds(s, (ref) => resolve(ref)?.size ?? 1);
    const margin = EXPLORE_MARGIN_CELLS * s.grid.cellPx;
    const limit = { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin };
    const cells = seenCells(sight, s.grid, limit);
    if (addExplored(s, cells) !== s) updateUntracked((current) => addExplored(current, cells));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sight, updateUntracked, scene.explored.length === 0]); // dopo l'azzeramento si ricorda subito ciò che si vede ora

  const toggleDoorById = useCallback((id: string) => updateUntracked((s) => toggleDoor(s, id)), [updateUntracked]);

  // Cambio scena o livello: azzera selezione e strumenti in corso
  useEffect(() => {
    setSelection(null);
    setPending(null);
    setElementTool("select");
    setEffectTool((t) => ({ ...t, placing: false }));
    setDrawTool((t) => ({ ...t, mode: null }));
    setCalibration(null);
    setObjectTool(null);
    setPickingStart(false);
  }, [scene.id, activeLayer]);

  const deleteSelection = useCallback(() => {
    if (!selection || (selection.layer === "background" && selection.id === BACKGROUND_ID)) return; // l'immagine di sfondo si rimuove dal pannello
    const keys = ({ elements: ["elements", "sightBlockers", "lights"], tokens: ["tokens"], effects: ["effects", "drawings"], background: ["objects"] } as const)[selection.layer];
    update((s) => ({ ...s, ...Object.fromEntries(keys.map((key) => [key, (s[key] as { id: string }[]).filter((x) => x.id !== selection.id)])) }));
    setSelection(null);
  }, [selection, update]);

  // Cambio di strumento: la forma in tracciamento si scarta; con lo strumento ostacolo non resta nulla di selezionato
  useEffect(() => {
    setTrace([]);
    setWandStatus(null);
    if (elementTool === "sight") setSelection(null);
  }, [elementTool]);

  /** Scorciatoia H: nasconde/mostra ai giocatori il token selezionato. */
  const toggleHiddenSelected = useCallback(() => {
    if (selection?.layer !== "tokens") return;
    update((s) => ({ ...s, tokens: s.tokens.map((t) => (t.id === selection.id ? { ...t, hidden: !t.hidden } : t)) }));
  }, [selection, update]);

  const closeTrace = useCallback(() => {
    if (trace.length < 3) return;
    const points = pxPointsToCells(
      trace.flatMap((p) => [p.x, p.y]),
      scene.grid,
    );
    update((s) => ({ ...s, sightBlockers: [...s.sightBlockers, { id: createId(), points }] }));
    setTrace([]);
  }, [trace, scene.grid, update]);

  const removeFromMap = useCallback(
    (ref: Ref) => {
      const removed = new Set(scene.tokens.filter((t) => sameRef(t.ref, ref)).map((t) => t.id));
      update((s) => ({ ...s, tokens: s.tokens.filter((t) => !sameRef(t.ref, ref)) }));
      setSelection((sel) => (sel?.layer === "tokens" && removed.has(sel.id) ? null : sel));
    },
    [scene.tokens, update],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape" && measuring) {
        setMeasuring(false);
      } else if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setMeasuring((m) => !m);
      } else if (e.key === "Escape") {
        setSelection(null);
        setPending(null);
        setElementTool("select");
        setEffectTool((t) => ({ ...t, placing: false }));
        setDrawTool((t) => ({ ...t, mode: null }));
        setCalibration(null);
        setObjectTool(null);
        setPickingStart(false);
      } else if ((e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey && !e.altKey && selection?.layer === "tokens" && !scene.layers.tokens.locked) {
        e.preventDefault();
        toggleHiddenSelected();
      } else if ((e.key === "o" || e.key === "O") && !e.ctrlKey && !e.metaKey && !e.altKey && selection?.layer === "elements") {
        const door = scene.elements.find((el) => el.id === selection.id && el.type === "door");
        if (door) {
          e.preventDefault();
          toggleDoorById(door.id);
        }
      } else if (e.key === "Enter" && elementTool === "sight" && trace.length >= 3) {
        e.preventDefault();
        closeTrace();
      } else if (e.key === "Backspace" && elementTool === "sight" && trace.length > 0) {
        e.preventDefault();
        setTrace((t) => t.slice(0, -1));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection && !scene.layers[selection.layer].locked) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeTrace, deleteSelection, elementTool, measuring, selection, scene.layers, scene.elements, toggleDoorById, toggleHiddenSelected, trace.length]);

  // Raggio di movimento del token selezionato: con la sua velocità e, più chiaro, con un movimento doppio
  const selectedToken = selection?.layer === "tokens" ? scene.tokens.find((t) => t.id === selection.id) : undefined;
  const movingSize = selectedToken ? (resolve(selectedToken.ref)?.size ?? 1) : 1;
  const speedFt = selectedToken?.speedFt ?? DEFAULT_SPEED_FT;
  const { elements, grid, sightBlockers } = scene;
  const movement = useMemo<MovementArea | null>(() => {
    if (!selectedToken || !showMovement || activeLayer !== "tokens" || speedFt <= 0) return null;
    const range = movementRange({ elements, grid, sightBlockers }, selectedToken, movingSize, speedFt * 2);
    return { cells: coveredCells(range, movingSize), speedFt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedToken?.x, selectedToken?.y, selectedToken?.id, movingSize, speedFt, showMovement, activeLayer, elements, grid, sightBlockers]);

  const placing =
    pickingStart ||
    (activeLayer === "tokens" && pending !== null) ||
    (activeLayer === "effects" && (effectTool.placing || drawTool.mode === "text")) ||
    (activeLayer === "background" && objectTool !== null) ||
    (activeLayer === "elements" && (elementTool === "light" || elementTool === "wand"));

  const addDrawing = (drawing: Drawing) => update((s) => ({ ...s, drawings: [...s.drawings, drawing] }));

  const toCells = (points: number[]) => pxPointsToCells(points, scene.grid);

  const onSketch = (sketch: SketchDraft) => {
    const style = { color: drawTool.color, strokeWidth: drawTool.strokeWidth };
    const points = toCells(sketch.points);
    addDrawing(
      sketch.kind === "line"
        ? { id: createId(), kind: "line", points: points as [number, number, number, number], ...style }
        : { id: createId(), kind: "freehand", points, ...style },
    );
  };

  const eraseDrawing = (id: string) => {
    update((s) => ({ ...s, drawings: s.drawings.filter((d) => d.id !== id) }));
    setSelection((sel) => (sel?.id === id ? null : sel));
  };

  const onPlace = (cell: Point, world: Point) => {
    if (pickingStart) {
      update((s) => ({ ...s, pcStart: { x: cell.x, y: cell.y } }));
      setPickingStart(false);
      return;
    }
    if (scene.layers[activeLayer].locked) return;
    if (activeLayer === "tokens" && pending) {
      placeTokens(scene.id, pending, cell, sizeOfRef);
      if (placeHidden) updateUntracked((s) => ({ ...s, tokens: s.tokens.map((t) => (pending.some((r) => sameRef(r, t.ref)) ? { ...t, hidden: true } : t)) }));
      setPending(null);
    } else if (activeLayer === "elements" && elementTool === "wand") {
      void runWand(world); // lo strumento resta attivo: si possono prendere più aree di fila
    } else if (activeLayer === "elements" && elementTool === "light") {
      // al centro della cella cliccata
      const light: Light = { id: createId(), x: cell.x + 0.5, y: cell.y + 0.5, ...DEFAULT_LIGHT };
      update((s) => ({ ...s, lights: [...s.lights, light] }));
      setSelection({ layer: "elements", id: light.id });
      setElementTool("select");
    } else if (activeLayer === "background" && objectTool) {
      const g = scene.grid;
      const base =
        objectTool.kind === "image"
          ? { w: 4, h: Math.max(0.25, snapTo(4 / (objectTool.aspect || 1), 0.25)), color: "#ffffff", blocksSight: false }
          : OBJECT_DEFAULTS[objectTool.kind];
      const object: MapObject = {
        id: createId(),
        kind: objectTool.kind,
        // centrato sul punto cliccato, agganciato a mezza cella
        x: snapTo((world.x - g.offsetX) / g.cellPx - base.w / 2, 0.5),
        y: snapTo((world.y - g.offsetY) / g.cellPx - base.h / 2, 0.5),
        w: base.w,
        h: base.h,
        rotation: 0,
        color: base.color,
        blocksSight: base.blocksSight,
        imageUrl: objectTool.imageUrl,
      };
      update((s) => ({ ...s, objects: [...s.objects, object] }));
      setSelection({ layer: "background", id: object.id });
      setObjectTool(null);
    } else if (activeLayer === "effects" && drawTool.mode === "text") {
      const [x = 0, y = 0] = toCells([world.x, world.y]);
      const text: Drawing = { id: createId(), kind: "text", x, y, text: "", fontSize: drawTool.fontSize, rotation: 0, color: drawTool.color };
      addDrawing(text);
      setSelection({ layer: "effects", id: text.id });
      setNewTextId(text.id);
      setDrawTool((t) => ({ ...t, mode: null }));
    } else if (activeLayer === "effects") {
      const g = scene.grid;
      const effect = {
        id: createId(),
        shape: effectTool.shape,
        x: snapTo((world.x - g.offsetX) / g.cellPx, 0.5),
        y: snapTo((world.y - g.offsetY) / g.cellPx, 0.5),
        sizeFt: effectTool.sizeFt,
        widthFt: effectTool.shape === "line" ? effectTool.widthFt : undefined,
        rotation: 0,
        color: effectTool.color,
        opacity: 0.4,
      };
      update((s) => ({ ...s, effects: [...s.effects, effect] }));
      setSelection({ layer: "effects", id: effect.id });
      setEffectTool((t) => ({ ...t, placing: false }));
    }
  };

  const setHiddenForRef = (ref: Ref, hidden: boolean) =>
    update((s) => ({ ...s, tokens: s.tokens.map((t) => (sameRef(t.ref, ref) ? { ...t, hidden } : t)) }));

  const setNpcsHidden = (hidden: boolean) => update((s) => ({ ...s, tokens: s.tokens.map((t) => (t.ref.kind === "npc" ? { ...t, hidden } : t)) }));

  const duplicateObject = (object: MapObject) => {
    const copy: MapObject = { ...object, id: createId(), x: object.x + 1, y: object.y + 1 };
    update((s) => ({ ...s, objects: [...s.objects, copy] }));
    setSelection({ layer: "background", id: copy.id });
  };

  const applyCalibration = (cells: number, alignToGrid: boolean) => {
    const [p1, p2] = calibration ?? [];
    const next = p1 && p2 && scene.background ? calibrateBackground(scene.background, p1, p2, cells, scene.grid, alignToGrid) : null;
    if (!next) {
      reportError(new Error("Calibrazione non riuscita: l'immagine risulterebbe troppo grande o troppo piccola. Controlla i punti e la distanza."));
      return;
    }
    update((s) => withBackgroundGeometry(s, next), { label: "calibra sfondo" });
    setCalibration(null);
  };

  const selectedOf = <T extends { id: string }>(layer: LayerKey, list: T[]) =>
    selection?.layer === layer ? list.find((x) => x.id === selection.id) : undefined;

  const replace = <K extends "elements" | "tokens" | "effects" | "drawings" | "sightBlockers" | "objects" | "lights">(key: K, item: Scene[K][number]) =>
    update((s) => ({ ...s, [key]: (s[key] as { id: string }[]).map((x) => (x.id === item.id ? item : x)) }));

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        {libraryOpen ? (
          <LibraryPanel
            scene={scene}
            pickingStart={pickingStart}
            onPickStart={setPickingStart}
            onClearStart={() => update(({ pcStart: _pcStart, ...s }) => s)}
            onClose={() => {
              setLibraryOpen(false);
              setPickingStart(false);
            }}
          />
        ) : (
          <>
        <LayerPanel
          scene={scene}
          active={activeLayer}
          onActivate={setActiveLayer}
          onChange={(layer, patch) => update((s) => ({ ...s, layers: { ...s.layers, [layer]: { ...s.layers[layer], ...patch } } }))}
        />
        {scene.layers[activeLayer].locked && <p className={styles.callout}>Livello bloccato: sbloccalo per modificarlo.</p>}

        {activeLayer === "background" && (
          <BackgroundPanel
            scene={scene}
            onUpdate={update}
            calibrationStep={calibration && calibration.length < 2 ? calibration.length : null}
            onStartCalibration={() => setCalibration([])}
            onCancelCalibration={() => setCalibration(null)}
            selectedObject={selectedOf("background", scene.objects)}
            objectTool={objectTool}
            onObjectTool={setObjectTool}
            onChangeObject={(o) => replace("objects", o)}
            onDeleteObject={deleteSelection}
            onDuplicateObject={duplicateObject}
          />
        )}
        {activeLayer === "elements" && (
          <ElementsPanel
            tool={elementTool}
            onTool={setElementTool}
            selected={selectedOf("elements", scene.elements)}
            onChange={(el) => replace("elements", el)}
            onDelete={deleteSelection}
            selectedBlocker={selectedOf("elements", scene.sightBlockers)}
            tracePoints={trace.length}
            onCloseTrace={closeTrace}
            onCancelTrace={() => setTrace([])}
            vision={scene.vision}
            onVision={(patch) => update((s) => ({ ...s, vision: { ...s.vision, ...patch } }))}
            onToggleDoor={toggleDoorById}
            selectedLight={selectedOf("elements", scene.lights)}
            onLightChange={(light) => replace("lights", light)}
            dark={scene.dark}
            onDark={(dark) => update((s) => ({ ...s, dark, vision: dark ? { ...s.vision, enabled: true } : s.vision }))}
            exploredCount={scene.explored.length}
            hasBackground={scene.background !== null}
            wandTolerance={wandTolerance}
            onWandTolerance={setWandTolerance}
            wandStatus={elementTool === "wand" ? wandStatus : null}
            onResetExplored={() => {
              if (confirm("Azzerare le zone esplorate? Il party ricorderà solo ciò che vede da adesso.")) update(resetExplored);
            }}
          />
        )}
        {activeLayer === "tokens" && (
          <TokensPanel
            scene={scene}
            resolve={resolve}
            pending={pending}
            onPending={setPending}
            onAddNpc={() => setNpcDialog(true)}
            onPlaceGroup={(group) => setPending(createNpcEntries(groupEntries(group.members)))}
            selected={selectedOf("tokens", scene.tokens)}
            onChangeToken={(token) => replace("tokens", token)}
            onSetHidden={setHiddenForRef}
            onSetNpcsHidden={setNpcsHidden}
            placeHidden={placeHidden}
            onPlaceHidden={setPlaceHidden}
            showMovement={showMovement}
            onShowMovement={setShowMovement}
            onPlayersMoveParty={(allowed) => update((s) => ({ ...s, playersMoveParty: allowed }))}
            onRemoveToken={deleteSelection}
            onRemoveFromMap={removeFromMap}
            onAddToInitiative={(ref: Ref) => useCombatStore.getState().apply((c, _getMod, ctx) => addCombatant(c, ref, ctx.id))}
          />
        )}
        {activeLayer === "effects" && (
          <EffectsPanel
            tool={effectTool}
            onTool={setEffectTool}
            drawTool={drawTool}
            onDrawTool={setDrawTool}
            selected={selectedOf("effects", scene.effects)}
            onChange={(effect) => replace("effects", effect)}
            selectedDrawing={selectedOf("effects", scene.drawings)}
            onDrawingChange={(drawing) => replace("drawings", drawing)}
            focusText={selection?.id != null && selection.id === newTextId}
            onDelete={deleteSelection}
            onClearAll={() => {
              if (confirm("Rimuovere tutti gli effetti dalla scena?")) update((s) => ({ ...s, effects: [] }));
            }}
            onClearDrawings={() => {
              if (confirm("Cancellare tutti i disegni dalla scena?")) update((s) => ({ ...s, drawings: [] }));
            }}
            count={scene.effects.length}
            drawingCount={scene.drawings.length}
          />
        )}
          </>
        )}
      </aside>

      <div className={styles.main}>
        <SceneBar scene={scene} libraryOpen={libraryOpen} onToggleLibrary={() => setLibraryOpen((o) => !o)} />
        <BattleStage
          scene={scene}
          resolve={resolve}
          activeLayer={activeLayer}
          selection={selection}
          elementTool={elementTool}
          drawTool={drawTool}
          placing={placing}
          calibration={calibration}
          currentRef={current?.entity.ref ?? null}
          onSelect={setSelection}
          onPlace={onPlace}
          onCalibrationPoint={(p) => setCalibration((pts) => (pts && pts.length < 2 ? [...pts, p] : pts))}
          onDrawElement={(rect) => {
            if (!isRectTool(elementTool)) return;
            const element = { id: createId(), type: elementTool, ...rect, rotation: 0, color: ELEMENT_COLORS[elementTool] };
            update((s) => ({ ...s, elements: [...s.elements, element] }));
            setSelection({ layer: "elements", id: element.id });
          }}
          onElementChange={(el) => replace("elements", el)}
          onObjectChange={(o) => replace("objects", o)}
          tracePoints={trace}
          onTracePoint={(p) => setTrace((t) => (t.length > 0 && Math.hypot(p.x - t[t.length - 1]!.x, p.y - t[t.length - 1]!.y) < 1 ? t : [...t, p]))}
          onTraceClose={closeTrace}
          onBlockerChange={(b) => replace("sightBlockers", b)}
          onBackgroundChange={(bg) => update((s) => withBackgroundGeometry(s, bg))}
          onTokenMove={(token) => replace("tokens", token)}
          onEffectChange={(effect) => replace("effects", effect)}
          onSketch={onSketch}
          onDrawingChange={(drawing) => replace("drawings", drawing)}
          onEraseDrawing={eraseDrawing}
          sight={sight}
          onToggleDoor={toggleDoorById}
          onLightChange={(light) => replace("lights", light)}
          measuring={measuring}
          onToggleRuler={() => setMeasuring((m) => !m)}
          movement={movement}
          pickingStart={pickingStart}
        />
      </div>

      {calibration && calibration.length === 2 && (
        <CalibrationDialog
          pixelDistance={Math.hypot(calibration[1]!.x - calibration[0]!.x, calibration[1]!.y - calibration[0]!.y)}
          feetPerCell={scene.grid.feetPerCell}
          onApply={applyCalibration}
          onClose={() => setCalibration(null)}
        />
      )}

      {npcDialog && (
        <AddNpcDialog
          onClose={() => setNpcDialog(false)}
          onSubmit={({ entries }) => {
            const refs = createNpcEntries(entries);
            // i nuovi PNG non sono ancora sulla mappa: il prossimo click li piazza
            setPending(refs.filter((r) => !scene.tokens.some((t) => sameRef(t.ref, r))));
            setNpcDialog(false);
          }}
        />
      )}
    </div>
  );
}
