import { create } from "zustand";
import { sameRef, type Ref, type SavedSceneSummary, type Scene } from "@vtt/shared";
import { api } from "../api/http";
import { useCombatStore } from "./combatStore";
import { sizeOfRef } from "./entities";
import { sceneSync, useSceneStore } from "./sceneStore";
import { reportError, track } from "./statusStore";

/** Libreria di scene salvate: l'elenco (riepiloghi) vive sul server, qui se ne tiene una copia aggiornata. */
interface SceneLibraryState {
  /** Dalla modificata più di recente. */
  items: SavedSceneSummary[];
  loaded: boolean;
}

export const useSceneLibraryStore = create<SceneLibraryState>(() => ({ items: [], loaded: false }));

const sorted = (items: SavedSceneSummary[]) => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, "it"));

function upsert(summary: SavedSceneSummary) {
  useSceneLibraryStore.setState((s) => ({ items: sorted([...s.items.filter((x) => x.id !== summary.id), summary]) }));
}

export async function loadSceneLibrary(): Promise<void> {
  const items = await api.sceneLibrary.list();
  useSceneLibraryStore.setState({ items: sorted(items), loaded: true });
}

/** Evento in tempo reale da un altro tab (`data: null` = eliminata). */
export function receiveSceneLibrary(id: string, data: unknown) {
  if (data === null) useSceneLibraryStore.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
  else upsert(data as SavedSceneSummary);
}

/** Salva la scena (com'è ora, con le modifiche in coda) nella libreria con questo nome. */
export async function saveSceneToLibrary(scene: Scene, name: string): Promise<SavedSceneSummary> {
  const summary = await track(api.sceneLibrary.save({ name, scene, npcs: useCombatStore.getState().combat.npcs }));
  upsert(summary);
  return summary;
}

/** `name`, o `name (2)`, `name (3)`… se c'è già una scena con quel nome. */
export function uniqueSceneName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLocaleLowerCase("it")));
  if (!used.has(name.toLocaleLowerCase("it"))) return name;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const candidate = name.slice(0, 80 - suffix.length) + suffix;
    if (!used.has(candidate.toLocaleLowerCase("it"))) return candidate;
  }
}

/**
 * Carica una scena salvata come nuova scena attiva. L'iniziativa non si tocca: i PNG della scena si aggiungono
 * all'elenco dei PNG senza entrare in combattimento. Con `bringPcs` i PG lasciano la scena `from` e vengono piazzati
 * nel punto di partenza della nuova (o al centro); senza, restano dove sono. Se `from` era in onda ai giocatori,
 * va in onda la nuova.
 */
export async function loadFromLibrary(id: string, opts: { from: Scene | undefined; bringPcs: boolean }): Promise<Scene> {
  const pcRefs: Ref[] = opts.bringPcs && opts.from ? opts.from.tokens.filter((t) => t.ref.kind === "pc").map((t) => t.ref) : [];
  const loaded = await track(api.sceneLibrary.load(id, { pcs: pcRefs.map((ref) => ({ ref, size: sizeOfRef(ref) })) }));
  const onAir = opts.from?.shownToPlayers ?? false;
  const scene: Scene = {
    ...loaded.scene,
    name: uniqueSceneName(loaded.scene.name, useSceneStore.getState().scenes.map((s) => s.name)),
    shownToPlayers: onAir,
  };
  if (loaded.npcs.length > 0) useCombatStore.getState().apply((c) => ({ ...c, npcs: [...c.npcs, ...loaded.npcs] }));
  const created = sceneSync.create(scene);
  useSceneStore.getState().select(scene.id);
  if (opts.from && (pcRefs.length > 0 || onAir)) {
    useSceneStore.getState().update(opts.from.id, (s) => ({
      ...s,
      shownToPlayers: onAir ? false : s.shownToPlayers,
      tokens: s.tokens.filter((t) => !pcRefs.some((r) => sameRef(r, t.ref))),
    }));
  }
  await created;
  return scene;
}

export async function duplicateInLibrary(id: string): Promise<void> {
  upsert(await track(api.sceneLibrary.duplicate(id)));
}

export async function renameInLibrary(id: string, name: string): Promise<void> {
  upsert(await track(api.sceneLibrary.rename(id, name)));
}

export async function removeFromLibrary(id: string): Promise<void> {
  await track(api.sceneLibrary.remove(id));
  useSceneLibraryStore.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
}

export const resyncSceneLibrary = () => loadSceneLibrary().catch(reportError);
