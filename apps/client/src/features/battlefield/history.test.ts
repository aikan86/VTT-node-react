import { describe, expect, it } from "vitest";
import { newScene, type MapElement, type Scene } from "@vtt/shared";
import {
  applyStep,
  diffScenes,
  emptyHistory,
  forScene,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  record,
  takeRedo,
  takeUndo,
  type History,
} from "./history";

const wall = (id: string, x = 0): MapElement => ({ id, type: "wall", x, y: 0, w: 1, h: 3, rotation: 0, color: "#4b5563" });
const door = (id: string): MapElement => ({ id, type: "door", x: 5, y: 0, w: 1, h: 1, rotation: 0, color: "#92400e", open: false });

function base(): Scene {
  return { ...newScene("Prova"), id: "s1", elements: [wall("w1"), door("d1")] };
}

/** Registra la modifica `fn` sulla scena e restituisce cronologia e scena nuove. */
function edit(h: History, scene: Scene, fn: (s: Scene) => Scene, now: number, opts: { label?: string } = {}) {
  const next = fn(scene);
  return { h: record(h, scene.id, diffScenes(scene, next), { now, ...opts }), scene: next };
}

function undo(h: History, scene: Scene) {
  const taken = takeUndo(h)!;
  return { h: taken.history, scene: applyStep(scene, taken.step, "undo"), label: taken.step.label };
}

function redo(h: History, scene: Scene) {
  const taken = takeRedo(h)!;
  return { h: taken.history, scene: applyStep(scene, taken.step, "redo"), label: taken.step.label };
}

const moveWall = (x: number) => (s: Scene) => ({ ...s, elements: s.elements.map((e) => (e.id === "w1" ? { ...e, x } : e)) });

describe("history", () => {
  it("undoes and redoes add, modify and delete, with a readable label", () => {
    let { h, scene } = edit(emptyHistory(), base(), (s) => ({ ...s, lights: [{ id: "l1", x: 1, y: 1, brightFt: 20, dimFt: 40, color: "#ffd27f" }] }), 0);
    ({ h, scene } = edit(h, scene, moveWall(4), 10_000));
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== "w1") }), 20_000));
    expect(h.undo.map((s) => s.label)).toEqual(["aggiungi luce", "sposta muro", "elimina muro"]);

    let r = undo(h, scene);
    expect(r.label).toBe("elimina muro");
    expect(r.scene.elements.map((e) => [e.id, e.x])).toEqual([
      ["w1", 4],
      ["d1", 5],
    ]);
    r = undo(r.h, r.scene);
    expect(r.scene.elements[0]!.x).toBe(0);
    r = undo(r.h, r.scene);
    expect(r.scene.lights).toEqual([]);
    expect(r.h.undo).toEqual([]);
    expect(takeUndo(r.h)).toBeNull();

    r = redo(r.h, r.scene);
    r = redo(r.h, r.scene);
    r = redo(r.h, r.scene);
    expect(r.scene.lights).toHaveLength(1);
    expect(r.scene.elements.map((e) => e.id)).toEqual(["d1"]);
    expect(takeRedo(r.h)).toBeNull();
  });

  it("labels resize, rotate and settings", () => {
    let { h, scene } = edit(emptyHistory(), base(), (s) => ({ ...s, elements: s.elements.map((e) => (e.id === "w1" ? { ...e, w: 2, h: 5 } : e)) }), 0);
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === "w1" ? { ...e, rotation: 90 } : e)) }), 10_000));
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, grid: { ...s.grid, cellPx: 70 } }), 20_000));
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, dark: true, vision: { ...s.vision, enabled: true } }), 30_000));
    ({ h } = edit(h, scene, (s) => ({ ...s, pcStart: { x: 1, y: 2 } }), 40_000));
    expect(h.undo.map((s) => s.label)).toEqual(["ridimensiona muro", "ruota muro", "modifica griglia", "2 modifiche", "imposta punto di partenza dei PG"]);
  });

  it("does not record or touch fog, on-air state and name", () => {
    const scene = base();
    const changes = diffScenes(scene, { ...scene, name: "Altro", shownToPlayers: true, explored: ["1,1"] });
    expect(changes).toEqual([]);
    expect(record(emptyHistory("s1"), "s1", changes, { now: 0 }).undo).toEqual([]);
  });

  it("restores only the fields the step changed, keeping what happened meanwhile", () => {
    let { h, scene } = edit(emptyHistory(), base(), (s) => ({ ...s, elements: s.elements.map((e) => (e.id === "d1" ? { ...e, x: 9 } : e)) }), 0);
    // durante il gioco: la porta si apre e la nebbia avanza (non registrati)
    scene = { ...scene, elements: scene.elements.map((e) => (e.id === "d1" ? { ...e, open: true } : e)), explored: ["2,2"] };
    const r = undo(h, scene);
    expect(r.scene.elements.find((e) => e.id === "d1")).toMatchObject({ x: 5, open: true });
    expect(r.scene.explored).toEqual(["2,2"]);
  });

  it("returns the same scene when there is nothing left to restore", () => {
    const { h, scene } = edit(emptyHistory(), base(), moveWall(3), 0);
    const gone = { ...scene, elements: scene.elements.filter((e) => e.id !== "w1") };
    expect(applyStep(gone, takeUndo(h)!.step, "undo")).toBe(gone);
  });

  it("keeps at most 100 steps, dropping the oldest", () => {
    let h = emptyHistory();
    let scene = base();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) ({ h, scene } = edit(h, scene, moveWall(i), i * 10_000));
    expect(h.undo).toHaveLength(HISTORY_LIMIT);
    // il più vecchio rimasto è lo spostamento da 5 a 6
    expect(h.undo[0]!.changes[0]).toMatchObject({ before: { x: 5 }, after: { x: 6 } });
  });

  it("merges a continuous change of the same items into one step", () => {
    let { h, scene } = edit(emptyHistory(), base(), moveWall(1), 0);
    for (let i = 2; i <= 10; i++) ({ h, scene } = edit(h, scene, moveWall(i), i * (MERGE_WINDOW_MS / 2)));
    expect(h.undo).toHaveLength(1);
    expect(h.undo[0]!.changes[0]).toMatchObject({ before: { x: 0 }, after: { x: 10 } });
    expect(undo(h, scene).scene.elements[0]!.x).toBe(0);

    // dopo una pausa, o su un altro elemento, è un passo nuovo
    ({ h, scene } = edit(h, scene, moveWall(11), 10 * (MERGE_WINDOW_MS / 2) + MERGE_WINDOW_MS + 1));
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === "d1" ? { ...e, x: 6 } : e)) }), 10 * (MERGE_WINDOW_MS / 2) + MERGE_WINDOW_MS + 2));
    expect(h.undo).toHaveLength(3);
  });

  it("never merges additions, deletions or labelled steps", () => {
    let { h, scene } = edit(emptyHistory(), base(), (s) => ({ ...s, elements: [...s.elements, wall("w2")] }), 0);
    ({ h, scene } = edit(h, scene, (s) => ({ ...s, elements: [...s.elements, wall("w3")] }), 1));
    ({ h, scene } = edit(h, scene, moveWall(2), 2, { label: "calibra sfondo" }));
    ({ h } = edit(h, scene, moveWall(3), 3, { label: "calibra sfondo" }));
    expect(h.undo.map((s) => s.label)).toEqual(["aggiungi muro", "aggiungi muro", "calibra sfondo", "calibra sfondo"]);
  });

  it("drops a merged step that returns to where it started", () => {
    let { h, scene } = edit(emptyHistory(), base(), moveWall(3), 0);
    ({ h } = edit(h, scene, moveWall(0), 100));
    expect(h.undo).toEqual([]);
  });

  it("a new change clears redo and does not merge into what came before", () => {
    let { h, scene } = edit(emptyHistory(), base(), moveWall(1), 0);
    const r = undo(h, scene);
    ({ h, scene } = edit(r.h, r.scene, moveWall(7), 100));
    expect(h.redo).toEqual([]);
    expect(h.undo).toHaveLength(1);
    expect(h.undo[0]!.changes[0]).toMatchObject({ before: { x: 0 }, after: { x: 7 } });
  });

  it("starts over when the scene changes", () => {
    const { h } = edit(emptyHistory(), base(), moveWall(1), 0);
    expect(forScene(h, "s1")).toBe(h);
    expect(forScene(h, "s2")).toEqual(emptyHistory("s2"));
    const other = { ...base(), id: "s2" };
    const next = record(h, "s2", diffScenes(other, moveWall(4)(other)), { now: 1 });
    expect(next.sceneId).toBe("s2");
    expect(next.undo).toHaveLength(1);
  });
});
