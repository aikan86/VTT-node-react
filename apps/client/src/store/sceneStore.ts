import { create } from "zustand";
import { newScene, type Scene } from "@vtt/shared";
import { api } from "../api/http";
import { createSaver } from "./debounce";
import { track } from "./statusStore";

const ACTIVE_KEY = "vtt.activeSceneId";
const saver = createSaver<Scene>((s) => api.scenes.update(s), 300);

interface SceneState {
  scenes: Scene[];
  activeId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  select: (id: string) => void;
  create: (name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (id: string, fn: (scene: Scene) => Scene) => void;
  /** Aggiorna tutte le scene (es. per rimuovere token orfani). */
  updateAll: (fn: (scene: Scene) => Scene) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  activeId: null,
  loaded: false,

  load: async () => {
    let scenes = await api.scenes.list();
    if (scenes.length === 0) {
      const first = newScene("Scena 1");
      await api.scenes.create(first);
      scenes = [first];
    }
    const stored = localStorage.getItem(ACTIVE_KEY);
    const activeId = scenes.some((s) => s.id === stored) ? stored : scenes[0]!.id;
    set({ scenes, activeId, loaded: true });
  },

  select: (id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    set({ activeId: id });
  },

  create: async (name) => {
    const scene = newScene(name);
    await track(api.scenes.create(scene));
    set((s) => ({ scenes: [...s.scenes, scene] }));
    get().select(scene.id);
  },

  remove: async (id) => {
    if (get().scenes.length <= 1) return;
    saver.cancel(id);
    await track(api.scenes.remove(id));
    const scenes = get().scenes.filter((s) => s.id !== id);
    set({ scenes });
    if (get().activeId === id) get().select(scenes[0]!.id);
  },

  update: (id, fn) => {
    let updated: Scene | undefined;
    set((s) => ({
      scenes: s.scenes.map((scene) => {
        if (scene.id !== id) return scene;
        updated = fn(scene);
        return updated;
      }),
    }));
    if (updated) saver.schedule(id, updated);
  },

  updateAll: (fn) => {
    for (const scene of get().scenes) {
      const next = fn(scene);
      if (next !== scene) get().update(scene.id, () => next);
    }
  },
}));

export function useActiveScene(): Scene | undefined {
  return useSceneStore((s) => s.scenes.find((scene) => scene.id === s.activeId));
}

export const flushScenes = () => saver.flushAll();
