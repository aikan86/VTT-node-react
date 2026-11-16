import { create } from "zustand";
import { newScene, type Scene, type Versioned } from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { reportError, track } from "./statusStore";
import { CollectionSync } from "./sync/collectionSync";
import type { Op } from "./sync/docSync";

const ACTIVE_KEY = "vtt.activeSceneId";

interface SceneState {
  scenes: Scene[];
  activeId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  hydrate: (list: Versioned<Scene>[]) => void;
  select: (id: string) => void;
  /** Mostra questa scena ai giocatori (null = nessuna: la vista giocatori resta in attesa). */
  showToPlayers: (id: string | null) => void;
  create: (name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Trasformazione pura della scena (rieseguibile su versioni più recenti: id nuovi da `ctx.id()`). */
  update: (id: string, fn: Op<Scene>) => void;
  /** Applica la trasformazione a tutte le scene che ne vengono modificate (es. per rimuovere token orfani). */
  updateAll: (fn: Op<Scene>) => void;
}

function pickActive(scenes: Scene[], preferred: string | null): string | null {
  if (preferred && scenes.some((s) => s.id === preferred)) return preferred;
  return scenes[0]?.id ?? null;
}

export const sceneSync = new CollectionSync<Scene>({
  api: {
    list: () => api.scenes.list(),
    create: (s) => track(api.scenes.create(s)),
    update: (s, rev) => track(api.scenes.update(s, rev)),
    remove: (id) => track(api.scenes.remove(id)),
  },
  delayMs: 300,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (scenes) =>
    useSceneStore.setState((s) => ({ scenes, activeId: pickActive(scenes, s.activeId) })),
});

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  activeId: null,
  loaded: false,

  load: async () => {
    await sceneSync.load();
    if (sceneSync.list.length === 0) await sceneSync.create(newScene("Scena 1"));
    set({ activeId: pickActive(sceneSync.list, localStorage.getItem(ACTIVE_KEY)), loaded: true });
  },

  hydrate: (list) => {
    sceneSync.hydrate(list);
    set({ activeId: pickActive(sceneSync.list, get().activeId), loaded: true });
  },

  select: (id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    set({ activeId: id });
  },

  showToPlayers: (id) => {
    for (const scene of get().scenes) {
      const shown = scene.id === id;
      if (scene.shownToPlayers !== shown) get().update(scene.id, (s) => (s.shownToPlayers === shown ? s : { ...s, shownToPlayers: shown }));
    }
  },

  create: async (name) => {
    const scene = newScene(name);
    const created = sceneSync.create(scene);
    get().select(scene.id);
    await created;
  },

  remove: async (id) => {
    if (get().scenes.length <= 1) return;
    await sceneSync.remove(id);
    if (get().activeId === id) get().select(get().scenes[0]!.id);
  },

  update: (id, fn) => sceneSync.update(id, fn),

  updateAll: (fn) => {
    for (const scene of get().scenes) {
      // si prova sulla versione attuale; l'operazione registrata è la funzione, non il risultato
      if (fn(scene, { id: () => "", rng: () => 0 }) !== scene) get().update(scene.id, fn);
    }
  },
}));

export function useActiveScene(): Scene | undefined {
  return useSceneStore((s) => s.scenes.find((scene) => scene.id === s.activeId));
}

export const flushScenes = () => sceneSync.flushAll();
