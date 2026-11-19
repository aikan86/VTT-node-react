import { create } from "zustand";
import {
  createId,
  HandoutSchema,
  MonsterSchema,
  newHandout,
  NpcGroupSchema,
  type Handout,
  type Monster,
  type MonsterStats,
  type NpcGroup,
  type NpcGroupMember,
} from "@vtt/shared";
import { api, isPermanentError } from "../api/http";
import { reportError, track } from "./statusStore";
import { CollectionSync, type CollectionApi } from "./sync/collectionSync";

/** Materiale del master: handout, mostri del bestiario e gruppi di PNG (tre collezioni sincronizzate). */
interface LibraryState {
  /** Dal più recente. */
  handouts: Handout[];
  /** In ordine alfabetico. */
  monsters: Monster[];
  /** In ordine alfabetico. */
  npcGroups: NpcGroup[];
}

export const useLibraryStore = create<LibraryState>(() => ({ handouts: [], monsters: [], npcGroups: [] }));

const tracked = <T>(c: CollectionApi<T>): CollectionApi<T> => ({
  list: () => c.list(),
  create: (doc) => track(c.create(doc)),
  update: (doc, rev) => track(c.update(doc, rev)),
  remove: (id) => track(c.remove(id)),
});
const byName = <T extends { name: string }>(list: T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "it"));

export const handoutSync = new CollectionSync<Handout>({
  api: tracked(api.handouts),
  delayMs: 300,
  canSave: (h) => HandoutSchema.safeParse(h).success,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (list) => useLibraryStore.setState({ handouts: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }),
});

export const monsterSync = new CollectionSync<Monster>({
  api: tracked(api.monsters),
  delayMs: 300,
  canSave: (m) => MonsterSchema.safeParse(m).success,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (list) => useLibraryStore.setState({ monsters: byName(list) }),
});

export const npcGroupSync = new CollectionSync<NpcGroup>({
  api: tracked(api.npcGroups),
  delayMs: 300,
  canSave: (g) => NpcGroupSchema.safeParse(g).success,
  isPermanent: isPermanentError,
  onError: reportError,
  onChange: (list) => useLibraryStore.setState({ npcGroups: byName(list) }),
});

const syncs = [handoutSync, monsterSync, npcGroupSync] as const;
export const loadLibrary = () => Promise.all(syncs.map((s) => s.load()));
export const resyncLibrary = () => Promise.all(syncs.map((s) => s.resync()));
export const flushLibrary = () => Promise.all(syncs.map((s) => s.flushAll()));

/** Carica l'immagine e crea l'handout (non ancora mostrato). */
export async function addHandout(title: string, file: File): Promise<Handout> {
  const { url } = await track(api.upload(file));
  const handout = newHandout(title, url);
  await handoutSync.create(handout);
  return handout;
}

/** Mostra l'handout ai giocatori (a schermo intero) e toglie quello mostrato prima. */
export function showHandout(id: string, now = new Date()) {
  const shownAt = now.toISOString();
  for (const h of handoutSync.list) {
    if (h.id === id) handoutSync.update(h.id, (x) => ({ ...x, shownAt }));
    else if (h.shownAt) handoutSync.update(h.id, (x) => ({ ...x, shownAt: null }));
  }
}

/** Nessun handout a schermo: i giocatori tornano alla mappa. */
export function hideHandouts() {
  for (const h of handoutSync.list) if (h.shownAt) handoutSync.update(h.id, (x) => ({ ...x, shownAt: null }));
}

export const renameHandout = (id: string, title: string) => handoutSync.update(id, (h) => ({ ...h, title }));
export const deleteHandout = (id: string) => handoutSync.remove(id);

/** Aggiunge i mostri al bestiario del master. */
export function addMonsters(list: MonsterStats[]): Monster[] {
  const monsters = list.map((m) => ({ ...m, id: createId() }));
  for (const m of monsters) monsterSync.create(m).catch(() => undefined); // errore già segnalato
  return monsters;
}
export const deleteMonster = (id: string) => monsterSync.remove(id);

export function saveNpcGroup(name: string, members: NpcGroupMember[]): NpcGroup {
  const group: NpcGroup = { id: createId(), name: name.trim(), members };
  npcGroupSync.create(group).catch(() => undefined);
  return group;
}
export const deleteNpcGroup = (id: string) => npcGroupSync.remove(id);
