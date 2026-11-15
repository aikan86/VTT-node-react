import { useCallback, useEffect, useState } from "react";
import { addCombatant, createId, ELEMENT_COLORS, sameRef, type Drawing, type LayerKey, type Point, type Ref, type Scene } from "@vtt/shared";
import { BattleStage } from "../features/battlefield/BattleStage";
import { isTyping } from "../features/battlefield/hooks";
import { pxPointsToCells, snapTo, withBackgroundGeometry } from "../features/battlefield/geometry";
import { BackgroundPanel } from "../features/battlefield/panels/BackgroundPanel";
import { EffectsPanel } from "../features/battlefield/panels/EffectsPanel";
import { ElementsPanel } from "../features/battlefield/panels/ElementsPanel";
import { LayerPanel } from "../features/battlefield/panels/LayerPanel";
import { TokensPanel } from "../features/battlefield/panels/TokensPanel";
import { SceneBar } from "../features/battlefield/SceneBar";
import type { DrawTool, EffectTool, ElementTool, PendingPlacement, Selection, SketchDraft } from "../features/battlefield/types";
import styles from "../features/battlefield/Battlefield.module.css";
import { AddNpcDialog } from "../features/initiative/AddNpcDialog";
import { useInitiative } from "../features/initiative/useInitiative";
import { createNpcs, placeTokens } from "../store/actions";
import { useCombatStore } from "../store/combatStore";
import { sizeOfRef, useEntityResolver } from "../store/entities";
import { useActiveScene, useSceneStore } from "../store/sceneStore";

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
  const [npcDialog, setNpcDialog] = useState(false);

  const update = useCallback((fn: (s: Scene) => Scene) => useSceneStore.getState().update(scene.id, fn), [scene.id]);

  // Cambio scena o livello: azzera selezione e strumenti in corso
  useEffect(() => {
    setSelection(null);
    setPending(null);
    setElementTool("select");
    setEffectTool((t) => ({ ...t, placing: false }));
    setDrawTool((t) => ({ ...t, mode: null }));
  }, [scene.id, activeLayer]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const keys = ({ elements: ["elements"], tokens: ["tokens"], effects: ["effects", "drawings"], background: [] } as const)[selection.layer];
    if (keys.length === 0) return;
    update((s) => ({ ...s, ...Object.fromEntries(keys.map((key) => [key, (s[key] as { id: string }[]).filter((x) => x.id !== selection.id)])) }));
    setSelection(null);
  }, [selection, update]);

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
      if (e.key === "Escape") {
        setSelection(null);
        setPending(null);
        setElementTool("select");
        setEffectTool((t) => ({ ...t, placing: false }));
        setDrawTool((t) => ({ ...t, mode: null }));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection && !scene.layers[selection.layer].locked) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, selection, scene.layers]);

  const placing =
    (activeLayer === "tokens" && pending !== null) || (activeLayer === "effects" && (effectTool.placing || drawTool.mode === "text"));

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
    if (scene.layers[activeLayer].locked) return;
    if (activeLayer === "tokens" && pending) {
      placeTokens(scene.id, pending, cell, sizeOfRef);
      setPending(null);
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

  const selectedOf = <T extends { id: string }>(layer: LayerKey, list: T[]) =>
    selection?.layer === layer ? list.find((x) => x.id === selection.id) : undefined;

  const replace = <K extends "elements" | "tokens" | "effects" | "drawings">(key: K, item: Scene[K][number]) =>
    update((s) => ({ ...s, [key]: (s[key] as { id: string }[]).map((x) => (x.id === item.id ? item : x)) }));

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <LayerPanel
          scene={scene}
          active={activeLayer}
          onActivate={setActiveLayer}
          onChange={(layer, patch) => update((s) => ({ ...s, layers: { ...s.layers, [layer]: { ...s.layers[layer], ...patch } } }))}
        />
        {scene.layers[activeLayer].locked && <p className={styles.callout}>Livello bloccato: sbloccalo per modificarlo.</p>}

        {activeLayer === "background" && <BackgroundPanel scene={scene} onUpdate={update} />}
        {activeLayer === "elements" && (
          <ElementsPanel
            tool={elementTool}
            onTool={setElementTool}
            selected={selectedOf("elements", scene.elements)}
            onChange={(el) => replace("elements", el)}
            onDelete={deleteSelection}
          />
        )}
        {activeLayer === "tokens" && (
          <TokensPanel
            scene={scene}
            resolve={resolve}
            pending={pending}
            onPending={setPending}
            onAddNpc={() => setNpcDialog(true)}
            selected={selectedOf("tokens", scene.tokens)}
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
      </aside>

      <div className={styles.main}>
        <SceneBar scene={scene} />
        <BattleStage
          scene={scene}
          resolve={resolve}
          activeLayer={activeLayer}
          selection={selection}
          elementTool={elementTool}
          drawTool={drawTool}
          placing={placing}
          currentRef={current?.entity.ref ?? null}
          onSelect={setSelection}
          onPlace={onPlace}
          onDrawElement={(rect) => {
            if (elementTool === "select") return;
            const element = { id: createId(), type: elementTool, ...rect, rotation: 0, color: ELEMENT_COLORS[elementTool] };
            update((s) => ({ ...s, elements: [...s.elements, element] }));
            setSelection({ layer: "elements", id: element.id });
          }}
          onElementChange={(el) => replace("elements", el)}
          onBackgroundChange={(bg) => update((s) => withBackgroundGeometry(s, bg))}
          onTokenMove={(token) => replace("tokens", token)}
          onEffectChange={(effect) => replace("effects", effect)}
          onSketch={onSketch}
          onDrawingChange={(drawing) => replace("drawings", drawing)}
          onEraseDrawing={eraseDrawing}
        />
      </div>

      {npcDialog && (
        <AddNpcDialog
          onClose={() => setNpcDialog(false)}
          onSubmit={({ template, quantity }) => {
            const refs = createNpcs(template, quantity);
            // i nuovi PNG non sono ancora sulla mappa: il prossimo click li piazza
            setPending(refs.filter((r) => !scene.tokens.some((t) => sameRef(t.ref, r))));
            setNpcDialog(false);
          }}
        />
      )}
    </div>
  );
}
