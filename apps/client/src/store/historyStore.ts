import { create } from "zustand";
import type { Scene } from "@vtt/shared";
import { applyStep, diffScenes, emptyHistory, forScene, record, takeRedo, takeUndo, type History } from "../features/battlefield/history";
import { sceneSync, useSceneStore } from "./sceneStore";

/** Cronologia annulla/ripeti delle modifiche del master alla scena attiva (logica in `features/battlefield/history`). */
export const useHistoryStore = create<History>(() => emptyHistory());

// Cambio di scena attiva: la cronologia riparte vuota
useSceneStore.subscribe((state, prev) => {
  if (state.activeId !== prev.activeId) useHistoryStore.setState(emptyHistory(state.activeId), true);
});

export interface EditOptions {
  /** Descrizione del passo al posto di quella calcolata. */
  label?: string;
  /** Non fondere con la modifica precedente. */
  separate?: boolean;
}

/** Modifica della scena da parte del master che si può annullare. Si salva sul server come ogni modifica. */
export function editScene(sceneId: string, fn: (s: Scene) => Scene, opts: EditOptions = {}): void {
  const before = sceneSync.get(sceneId);
  useSceneStore.getState().update(sceneId, fn);
  const after = sceneSync.get(sceneId);
  if (!before || !after || after === before) return;
  useHistoryStore.setState((h) => record(h, sceneId, diffScenes(before, after), { now: Date.now(), ...opts }), true);
}

function step(take: typeof takeUndo, direction: "undo" | "redo"): boolean {
  const activeId = useSceneStore.getState().activeId;
  const taken = take(forScene(useHistoryStore.getState(), activeId));
  if (!taken || !sceneSync.get(taken.step.sceneId)) return false;
  useHistoryStore.setState(taken.history, true);
  // operazione pura: se arriva una versione più recente dal server si riapplica su quella
  useSceneStore.getState().update(taken.step.sceneId, (s) => applyStep(s, taken.step, direction));
  return true;
}

export const undoSceneEdit = () => step(takeUndo, "undo");
export const redoSceneEdit = () => step(takeRedo, "redo");
